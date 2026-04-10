use anchor_lang::prelude::*;

declare_id!("88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB");

#[program]
pub mod safenudge {
    use super::*;

    pub fn create_group(ctx: Context<CreateGroupPlaceholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateGroupPlaceholder {}
