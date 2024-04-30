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
        ctx.accounts.initialize(id, quarantine, ctx.bumps.forward)
    }

    pub fn forward_sol(ctx: Context<ForwardSol>) -> Result<()> {
        ctx.accounts.forward_sol()
    }

    pub fn forward_token(ctx: Context<ForwardToken>) -> Result<()>
    {
        ctx.accounts.forward_token()
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

impl <'info> Initialize<'info> {

    pub fn initialize(&mut self, id: u64, quarantine: Pubkey, bump: u8) -> Result<()> {

        let forward = &mut self.forward;
        forward.id = id;
        forward.destination = *self.destination.key;
        forward.quarantine = quarantine;
        forward.bump = bump;

        Ok(())
    }
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

impl<'info> crate::ForwardSol<'info> {
    pub fn forward_sol(&mut self) -> Result<()> {

        let rent_balance = Rent::get()?.minimum_balance((&mut self.forward).to_account_info().data_len());
        let amount = (&mut self.forward).to_account_info().get_lamports() - rent_balance;
        if amount <= 0 {
            return Err(ForwardError::InsufficientFunds.into());
        }

        (&mut self.forward).to_account_info().sub_lamports(amount)?;
        (&mut self.destination).to_account_info().add_lamports(amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ForwardToken<'info> {

    #[account(
        mut,
        seeds = [FORWARD_SEED.as_ref(), destination.key().as_ref(), forward.id.to_le_bytes().as_ref()],
        bump = forward.bump
    )]
    pub forward: Account<'info, Forward>,

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

    pub mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub destination: SystemAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}


impl<'info> ForwardToken<'info> {

    pub fn forward_token(&mut self) -> Result<()>
    {
        let accounts = TransferChecked {
            from: self.forward_ata.to_account_info(),
            to: self.destination_ata.to_account_info(),
            authority: self.forward.to_account_info(),
            mint: self.mint.to_account_info()
        };

        let bump = &[self.forward.bump];
        let binding = self.forward.id.to_le_bytes();
        let id = binding.as_ref();
        let seeds: &[&[u8]] = &[
            FORWARD_SEED.as_ref(),
            self.destination.key.as_ref(),
            id,
            bump];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            accounts,
            signer_seeds);

        transfer_checked(cpi_ctx, self.forward_ata.amount, self.mint.decimals)?;
        Ok(())
    }
}

#[error_code]
pub enum ForwardError {
    #[msg("No funds available to forward")]
    InsufficientFunds,
    #[msg("Invalid destination")]
    InvalidDestination,
}