use anchor_lang::prelude::*;

/// Global configuration, PDA seeds = ["config"].
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Can update the config.
    pub admin: Pubkey,
    /// Off-chain battle server key allowed to report results.
    pub oracle: Pubkey,
    /// Receives the platform fee.
    pub treasury: Pubkey,
    /// Fee in basis points taken from the pot of decided matches (max 1000 = 10%).
    pub fee_bps: u16,
    /// When true, no new matches can be created or joined.
    pub paused: bool,
    pub bump: u8,
}

pub mod status {
    pub const OPEN: u8 = 0;
    pub const ACTIVE: u8 = 1;
    pub const SETTLED: u8 = 2;
    pub const CANCELLED: u8 = 3;
}

pub mod outcome {
    pub const PLAYER_A: u8 = 0;
    pub const PLAYER_B: u8 = 1;
    pub const DRAW: u8 = 2;
    pub const NONE: u8 = 255;
}

/// One wager. PDA seeds = ["match", match_id]. The account itself holds the
/// staked lamports on top of its rent-exempt minimum.
///
/// Layout (after the 8-byte discriminator) is mirrored in
/// packages/shared/src/escrow.ts → decodeMatchAccount.
#[account]
#[derive(InitSpace)]
pub struct Match {
    pub match_id: [u8; 16],
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub stake: u64,
    pub status: u8,
    pub created_at: i64,
    pub joined_at: i64,
    pub winner: u8,
    pub bump: u8,
}
