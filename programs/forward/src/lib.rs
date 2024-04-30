use anchor_lang::prelude::*;

use anchor_spl::{
    token_interface::{TokenAccount, Mint, TokenInterface, TransferChecked, transfer_checked},
};

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

        let rent_balance = Rent::get()?.minimum_balance(forward.to_account_info().data_len());
        let amount = forward.to_account_info().get_lamports() - rent_balance;
        if amount <= 0 {
            return Err(ForwardError::InsufficientFunds.into());
        }
        forward.to_account_info().sub_lamports(amount)?;
        destination.to_account_info().add_lamports(amount)?;
        Ok(())
    }

    pub fn forward_token(ctx: Context<ForwardToken>) -> Result<()>
    {
        let accounts = TransferChecked {
            from: ctx.accounts.forward_ata.to_account_info(),
            to: ctx.accounts.destination_ata.to_account_info(),
            authority: ctx.accounts.forward.to_account_info(),
            mint: ctx.accounts.mint.to_account_info()
        };

        let bump = &[ctx.accounts.forward.bump];
        let binding = ctx.accounts.forward.id.to_le_bytes();
        let id = binding.as_ref();
        let seeds: &[&[u8]] = &[
            FORWARD_SEED.as_ref(),
            ctx.accounts.destination.key.as_ref(),
            id,
            bump];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            accounts,
            signer_seeds);

        transfer_checked(cpi_ctx, ctx.accounts.forward_ata.amount, ctx.accounts.mint.decimals)?;
        Ok(())
    }
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

    pub destination: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ForwardSol<'info> {
    #[account(
        mut,
        seeds = [FORWARD_SEED.as_ref(), destination.key().as_ref(), forward.id.to_le_bytes().as_ref()],
        bump = forward.bump
    )]
    pub forward: Account<'info, Forward>,

    #[account(
        mut,
        // address = forward.destination @ ForwardError::InvalidDestination
    )]
    pub destination: SystemAccount<'info>,
}

#[error_code]
pub enum ForwardError {
    #[msg("No funds available to forward")]
    InsufficientFunds,
    #[msg("Invalid destination")]
    InvalidDestination,
}

#[derive(Accounts)]
pub struct ForwardToken<'info> {

    #[account(
        mut,
        seeds = [FORWARD_SEED.as_ref(), destination.key().as_ref(), forward.id.to_le_bytes().as_ref()],
        bump = forward.bump
    )]
    pub forward: Account<'info, Forward>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account()]
    pub destination: SystemAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = forward,
    )]
    pub forward_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = destination
    )]
    pub destination_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}