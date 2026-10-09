//! Account wrappers. Each one checks, at construction, what the matching Anchor type checks.

use core::marker::PhantomData;

use pinocchio::account::{Ref, RefMut};
use pinocchio::{AccountView, Address};

use crate::error::ErrorCode;
use crate::zero_copy::AccountData;
use crate::{FromAccountView, Result};

/// The System Program's address, which is also the owner of every uninitialized account.
pub const SYSTEM_PROGRAM_ID: Address = Address::new_from_array([0; 32]);

/// An account that signed the transaction. Same check as Anchor's `Signer`.
#[derive(Clone, Copy)]
pub struct Signer {
    view: AccountView,
}

impl FromAccountView for Signer {
    #[inline(always)]
    fn from_account_view(view: &AccountView, _program_id: &Address) -> Result<Self> {
        if !view.is_signer() {
            return Err(ErrorCode::AccountNotSigner.into());
        }
        Ok(Self { view: *view })
    }

    #[inline(always)]
    fn view(&self) -> &AccountView {
        &self.view
    }
}

/// Any account, unchecked. Every use needs a comment saying why no check is needed.
#[derive(Clone, Copy)]
pub struct UncheckedAccount {
    view: AccountView,
}

impl FromAccountView for UncheckedAccount {
    #[inline(always)]
    fn from_account_view(view: &AccountView, _program_id: &Address) -> Result<Self> {
        Ok(Self { view: *view })
    }

    #[inline(always)]
    fn view(&self) -> &AccountView {
        &self.view
    }
}

/// An account owned by this program, holding a `T` after its discriminator.
///
/// Checks, in Anchor's order: not an empty system account, owned by this program, discriminator
/// present and equal to `T`'s, data long enough for `T`. Data is read in place through
/// [`Account::load`] and written in place through [`Account::load_mut`]; there is no exit step
/// that serializes it back.
pub struct Account<T: AccountData> {
    view: AccountView,
    _data: PhantomData<T>,
}

impl<T: AccountData> FromAccountView for Account<T> {
    #[inline(always)]
    fn from_account_view(view: &AccountView, program_id: &Address) -> Result<Self> {
        if view.owned_by(&SYSTEM_PROGRAM_ID) && view.lamports() == 0 {
            return Err(ErrorCode::AccountNotInitialized.into());
        }
        if !view.owned_by(program_id) {
            return Err(ErrorCode::AccountOwnedByWrongProgram.into());
        }
        let data = view.try_borrow()?;
        let Some(discriminator) = data.get(..8) else {
            return Err(ErrorCode::AccountDiscriminatorNotFound.into());
        };
        if discriminator != T::DISCRIMINATOR {
            return Err(ErrorCode::AccountDiscriminatorMismatch.into());
        }
        if data.len() < T::SPACE {
            return Err(ErrorCode::AccountDidNotDeserialize.into());
        }
        Ok(Self {
            view: *view,
            _data: PhantomData,
        })
    }

    #[inline(always)]
    fn view(&self) -> &AccountView {
        &self.view
    }
}

impl<T: AccountData> Account<T> {
    /// Borrows the account's data as a `T`.
    #[inline(always)]
    pub fn load(&self) -> Result<Ref<'_, T>> {
        let data = self.view.try_borrow()?;
        // SAFETY: construction checked the data holds at least `8 + size_of::<T>()` bytes, `T`
        // has alignment 1 and accepts any bit pattern (`AccountData`), and the borrow guard keeps
        // the data from being borrowed mutably while the reference lives.
        Ok(Ref::map(data, |d| unsafe {
            &*(d.as_ptr().add(8) as *const T)
        }))
    }

    /// Borrows the account's data mutably as a `T`. Writes land directly in the account.
    #[inline(always)]
    pub fn load_mut(&mut self) -> Result<RefMut<'_, T>> {
        let data = self.view.try_borrow_mut()?;
        // SAFETY: as in `load`; the mutable guard makes the borrow exclusive.
        Ok(RefMut::map(data, |d| unsafe {
            &mut *(d.as_mut_ptr().add(8) as *mut T)
        }))
    }
}
