//! # clash_escrow
//!
//! Trustless 1v1 wager escrow for ClashAgent (https://clashagent.gg).
//!
//! Flow:
//! 1. `create_match`: player A locks `stake` lamports in a PDA.
//! 2. `join_match`: player B locks the same stake; the match is ACTIVE.
//! 3. The battle runs off-chain (deterministic, replayable engine).
//! 4. `settle`: the configured oracle reports the outcome. The winner gets the pot
//!    minus `fee_bps`, or both players are refunded on a draw.
//!
//! Safety valves:
//! - `cancel_match`: player A can withdraw before anyone joins.
//! - `refund_expired`: if the oracle hasn't settled within `SETTLE_TIMEOUT`
//!   seconds of the join, anyone can trigger a full refund to both players.
//!   The oracle can never take funds for itself; it can only pick A, B or draw.
use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub mod errors;
pub mod state;

use errors::EscrowError;
use state::*;

declare_id!("HYCPWZ9AGAN9sUHunz8z9bypX95aRzFPoe4N25sHmvH6");

/// Seconds after `join_match` before anyone may force a refund.
pub const SETTLE_TIMEOUT: i64 = 60 * 60;
pub const MAX_FEE_BPS: u16 = 1_000;

#[program]
pub mod clash_escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, oracle: Pubkey, treasury: Pubkey, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, EscrowError::FeeTooHigh);
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.oracle = oracle;
        cfg.treasury = treasury;
        cfg.fee_bps = fee_bps;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        oracle: Pubkey,
        treasury: Pubkey,
        fee_bps: u16,
        paused: bool,
        new_admin: Pubkey,
    ) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, EscrowError::FeeTooHigh);
        let cfg = &mut ctx.accounts.config;
        cfg.oracle = oracle;
        cfg.treasury = treasury;
        cfg.fee_bps = fee_bps;
        cfg.paused = paused;
        cfg.admin = new_admin;
        Ok(())
    }

    pub fn create_match(ctx: Context<CreateMatch>, match_id: [u8; 16], stake: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, EscrowError::Paused);
        require!(stake > 0, EscrowError::ZeroStake);

        let m = &mut ctx.accounts.match_account;
        m.match_id = match_id;
        m.player_a = ctx.accounts.player_a.key();
        m.player_b = Pubkey::default();
        m.stake = stake;
        m.status = status::OPEN;
        m.created_at = Clock::get()?.unix_timestamp;
        m.joined_at = 0;
        m.winner = outcome::NONE;
        m.bump = ctx.bumps.match_account;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player_a.to_account_info(),
                    to: ctx.accounts.match_account.to_account_info(),
                },
            ),
            stake,
        )?;
        emit!(MatchCreated { match_id, player_a: ctx.accounts.player_a.key(), stake });
        Ok(())
    }

    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        require!(!ctx.accounts.config.paused, EscrowError::Paused);
        let player_b = ctx.accounts.player_b.key();
        let stake;
        let match_id;
        {
            let m = &mut ctx.accounts.match_account;
            require!(m.status == status::OPEN, EscrowError::NotOpen);
            require!(m.player_a != player_b, EscrowError::SelfMatch);
            m.player_b = player_b;
            m.status = status::ACTIVE;
            m.joined_at = Clock::get()?.unix_timestamp;
            stake = m.stake;
            match_id = m.match_id;
        }
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player_b.to_account_info(),
                    to: ctx.accounts.match_account.to_account_info(),
                },
            ),
            stake,
        )?;
        emit!(MatchJoined { match_id, player_b, stake });
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>, result: u8) -> Result<()> {
        require!(result <= outcome::DRAW, EscrowError::InvalidOutcome);
        let cfg = &ctx.accounts.config;
        let m = &ctx.accounts.match_account;
        require!(m.status == status::ACTIVE, EscrowError::NotActive);

        let stake = m.stake;
        let pot = stake.checked_mul(2).ok_or(EscrowError::Overflow)?;
        let match_info = ctx.accounts.match_account.to_account_info();

        if result == outcome::DRAW {
            move_lamports(&match_info, &ctx.accounts.player_a.to_account_info(), stake)?;
            move_lamports(&match_info, &ctx.accounts.player_b.to_account_info(), stake)?;
        } else {
            let fee = (pot as u128)
                .checked_mul(cfg.fee_bps as u128)
                .ok_or(EscrowError::Overflow)?
                .checked_div(10_000)
                .ok_or(EscrowError::Overflow)? as u64;
            let prize = pot.checked_sub(fee).ok_or(EscrowError::Overflow)?;
            let winner = if result == outcome::PLAYER_A {
                ctx.accounts.player_a.to_account_info()
            } else {
                ctx.accounts.player_b.to_account_info()
            };
            move_lamports(&match_info, &winner, prize)?;
            if fee > 0 {
                move_lamports(&match_info, &ctx.accounts.treasury.to_account_info(), fee)?;
            }
        }

        let m = &mut ctx.accounts.match_account;
        m.status = status::SETTLED;
        m.winner = result;
        emit!(MatchSettled { match_id: m.match_id, outcome: result, stake });
        // Account is closed (rent → player A) via the `close` constraint.
        Ok(())
    }

    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let m = &mut ctx.accounts.match_account;
        require!(m.status == status::OPEN, EscrowError::NotOpen);
        m.status = status::CANCELLED;
        emit!(MatchCancelled { match_id: m.match_id });
        // Stake + rent go back to player A through `close = player_a`.
        Ok(())
    }

    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let m = &ctx.accounts.match_account;
        require!(m.status == status::ACTIVE, EscrowError::NotActive);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= m.joined_at.saturating_add(SETTLE_TIMEOUT), EscrowError::NotExpired);
        let stake = m.stake;
        let info = ctx.accounts.match_account.to_account_info();
        move_lamports(&info, &ctx.accounts.player_b.to_account_info(), stake)?;
        // player A's stake + rent returns via `close = player_a`.
        let m = &mut ctx.accounts.match_account;
        m.status = status::CANCELLED;
        m.winner = outcome::DRAW;
        emit!(MatchRefunded { match_id: m.match_id });
        Ok(())
    }
}

/// Move lamports out of a program-owned account.
fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let from_balance = from.lamports();
    let new_from = from_balance.checked_sub(amount).ok_or(EscrowError::Overflow)?;
    let new_to = to.lamports().checked_add(amount).ok_or(EscrowError::Overflow)?;
    **from.try_borrow_mut_lamports()? = new_from;
    **to.try_borrow_mut_lamports()? = new_to;
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 16])]
pub struct CreateMatch<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = player_a,
        space = 8 + Match::INIT_SPACE,
        seeds = [b"match", match_id.as_ref()],
        bump
    )]
    pub match_account: Account<'info, Match>,
    #[account(mut)]
    pub player_a: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"match", match_account.match_id.as_ref()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,
    #[account(mut)]
    pub player_b: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"match", match_account.match_id.as_ref()],
        bump = match_account.bump,
        close = player_a
    )]
    pub match_account: Account<'info, Match>,
    #[account(address = config.oracle @ EscrowError::NotOracle)]
    pub oracle: Signer<'info>,
    /// CHECK: verified against match_account.player_a
    #[account(mut, address = match_account.player_a @ EscrowError::WrongPlayer)]
    pub player_a: UncheckedAccount<'info>,
    /// CHECK: verified against match_account.player_b
    #[account(mut, address = match_account.player_b @ EscrowError::WrongPlayer)]
    pub player_b: UncheckedAccount<'info>,
    /// CHECK: verified against config.treasury
    #[account(mut, address = config.treasury @ EscrowError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.match_id.as_ref()],
        bump = match_account.bump,
        has_one = player_a @ EscrowError::WrongPlayer,
        close = player_a
    )]
    pub match_account: Account<'info, Match>,
    #[account(mut)]
    pub player_a: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.match_id.as_ref()],
        bump = match_account.bump,
        close = player_a
    )]
    pub match_account: Account<'info, Match>,
    /// CHECK: verified against match_account.player_a
    #[account(mut, address = match_account.player_a @ EscrowError::WrongPlayer)]
    pub player_a: UncheckedAccount<'info>,
    /// CHECK: verified against match_account.player_b
    #[account(mut, address = match_account.player_b @ EscrowError::WrongPlayer)]
    pub player_b: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------------------
// Events

#[event]
pub struct MatchCreated {
    pub match_id: [u8; 16],
    pub player_a: Pubkey,
    pub stake: u64,
}

#[event]
pub struct MatchJoined {
    pub match_id: [u8; 16],
    pub player_b: Pubkey,
    pub stake: u64,
}

#[event]
pub struct MatchSettled {
    pub match_id: [u8; 16],
    pub outcome: u8,
    pub stake: u64,
}

#[event]
pub struct MatchCancelled {
    pub match_id: [u8; 16],
}

#[event]
pub struct MatchRefunded {
    pub match_id: [u8; 16],
}
