use anchor_lang::prelude::*;
// use crate::program::Forward;

// This is your program's public key and it will update
// automatically when you build the project.
declare_id!("EA1L67z5Zraz8v8g1MhNKAKaMQkmFP1SprKaVv2gRXxP");

pub const FORWARD_SEED: &[u8] = b"forward";

#[program]
mod forward {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, id: u64, quarantine: Pubkey) -> Result<()> {

        let forward = &mut ctx.accounts.forward;
        forward.id = id;
        forward.destination = *ctx.accounts.destination.key;
        forward.quarantine = quarantine;
        forward.bump = ctx.bumps.forward;

        Ok(())
    }

    pub fn forward_sol(ctx: Context<ForwardSol>) -> Result<()> {
        let forward = &mut ctx.accounts.forward;
        let destination = &mut ctx.accounts.destination;

        // test but should be done in constraint now.
        // if *destination.key != forward.destination {
        //     return Err(ForwardError::InvalidDestination.into());
        // }

        let rent_balance = Rent::get()?.minimum_balance(forward.to_account_info().data_len());
        let amount = forward.to_account_info().get_lamports() - rent_balance;
        if amount <= 0 {
            return Err(ForwardError::InsufficientFunds.into());
        }
        forward.to_account_info().sub_lamports(amount)?;
        destination.to_account_info().add_lamports(amount)?;
        Ok(())
    }

    // pub fn execute_token(ctx: Context<ExecuteToken>) -> Result<()> 
    // {
    //     let destination = &ctx.accounts.to_ata;
    //     let source = &ctx.accounts.from_ata;
    //     let token_program = &ctx.accounts.token_program;
    //     let authority = &ctx.accounts.from;

    //     // Transfer tokens from taker to initializer
    //     let cpi_accounts = SplTransfer {
    //         from: source.to_account_info().clone(),
    //         to: destination.to_account_info().clone(),
    //         authority: authority.to_account_info().clone(),
    //     };
    //     let cpi_program = token_program.to_account_info();

    //     token::transfer(
    //         CpiContext::new(cpi_program, cpi_accounts),
    //         amount)?;
    //     Ok(())
    // }
}

#[account]
pub struct Forward {
    id: u64,
    pub destination: Pubkey,
    pub quarantine: Pubkey,
    bump: u8,
}

impl Forward {
    //discrimiator + id + destination + quarantine + bump
    pub const LEN: usize = 8 + 8 + 32 + 32 + 1;
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // id.to_le_bytes().as_ref()
    #[account(
        init,
        payer = user,
        space = Forward::LEN,
        seeds = [FORWARD_SEED.as_ref(), destination.key().as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub forward: Account<'info, Forward>,

    /// CHECK: todo - safe?
    pub destination: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ForwardSol<'info> {
    //, forward.id.to_le_bytes().as_ref()
    #[account(
        mut,
        seeds = [FORWARD_SEED.as_ref(), destination.key().as_ref(), forward.id.to_le_bytes().as_ref()],
        bump = forward.bump
    )]
    pub forward: Account<'info, Forward>,

    /// CHECK: todo - safe?
    #[account(mut, constraint = destination.key() == forward.destination @ ForwardError::InvalidDestination)]
    pub destination: UncheckedAccount<'info>,
}

#[error_code]
pub enum ForwardError {
    #[msg("No funds available to forward")]
    InsufficientFunds,
    #[msg("Invalid destination")]
    InvalidDestination,
}