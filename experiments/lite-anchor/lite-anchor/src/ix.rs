//! Instruction data: 8-byte discriminator, then fixed-size Borsh-encoded arguments.

use pinocchio::Address;

use crate::error::ErrorCode;
use crate::Result;

/// An instruction argument with a fixed-size Borsh encoding.
pub trait IxArg: Sized {
    /// Reads `Self` from the front of `data` and advances it.
    fn read(data: &mut &[u8]) -> Result<Self>;
}

#[inline(always)]
fn take<'a>(data: &mut &'a [u8], n: usize) -> Result<&'a [u8]> {
    if data.len() < n {
        return Err(ErrorCode::InstructionDidNotDeserialize.into());
    }
    let (head, tail) = data.split_at(n);
    *data = tail;
    Ok(head)
}

macro_rules! impl_int {
    ($($t:ty),*) => {$(
        impl IxArg for $t {
            #[inline(always)]
            fn read(data: &mut &[u8]) -> Result<Self> {
                let mut bytes = [0u8; core::mem::size_of::<$t>()];
                bytes.copy_from_slice(take(data, core::mem::size_of::<$t>())?);
                Ok(<$t>::from_le_bytes(bytes))
            }
        }
    )*};
}
impl_int!(u8, i8, u16, i16, u32, i32, u64, i64, u128, i128);

impl IxArg for bool {
    #[inline(always)]
    fn read(data: &mut &[u8]) -> Result<Self> {
        match take(data, 1)?[0] {
            0 => Ok(false),
            1 => Ok(true),
            _ => Err(ErrorCode::InstructionDidNotDeserialize.into()),
        }
    }
}

impl IxArg for Address {
    #[inline(always)]
    fn read(data: &mut &[u8]) -> Result<Self> {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(take(data, 32)?);
        Ok(Address::new_from_array(bytes))
    }
}
