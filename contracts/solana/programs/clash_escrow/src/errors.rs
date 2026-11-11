use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("The arena is paused")]
    Paused,
    #[msg("Stake must be greater than zero")]
    ZeroStake,
    #[msg("Match is not open")]
    NotOpen,
    #[msg("Match is not active")]
    NotActive,
    #[msg("You cannot fight yourself")]
    SelfMatch,
    #[msg("Only the oracle can settle matches")]
    NotOracle,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Account does not match the recorded player")]
    WrongPlayer,
    #[msg("Account does not match the configured treasury")]
    WrongTreasury,
    #[msg("Fee too high (max 10%)")]
    FeeTooHigh,
    #[msg("Settlement window has not expired yet")]
    NotExpired,
    #[msg("Arithmetic overflow")]
    Overflow,
}
