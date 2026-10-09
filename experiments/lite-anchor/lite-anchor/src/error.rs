//! Framework errors, numbered like Anchor's `ErrorCode` so clients map them the same way.

use pinocchio::error::ProgramError;

/// The subset of Anchor's framework errors that lite-anchor can raise. Values match
/// `anchor_lang::error::ErrorCode`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum ErrorCode {
    InstructionFallbackNotFound = 101,
    InstructionDidNotDeserialize = 102,
    ConstraintMut = 2000,
    ConstraintHasOne = 2001,
    ConstraintSigner = 2002,
    ConstraintRaw = 2003,
    ConstraintSeeds = 2006,
    ConstraintAddress = 2012,
    ConstraintDuplicateMutableAccount = 2040,
    AccountDiscriminatorNotFound = 3001,
    AccountDiscriminatorMismatch = 3002,
    AccountDidNotDeserialize = 3003,
    AccountNotEnoughKeys = 3005,
    AccountOwnedByWrongProgram = 3007,
    InvalidProgramId = 3008,
    InvalidProgramExecutable = 3009,
    AccountNotSigner = 3010,
    AccountNotInitialized = 3012,
}

impl From<ErrorCode> for ProgramError {
    #[inline(always)]
    fn from(e: ErrorCode) -> Self {
        ProgramError::Custom(e as u32)
    }
}

/// First code of a program's own errors, as in Anchor.
pub const ERROR_CODE_OFFSET: u32 = 6000;
