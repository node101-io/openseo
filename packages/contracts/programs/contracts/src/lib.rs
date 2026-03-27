use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("Ffac4PLvjZPLQpdRwN52sgeJrApWganmiQTaoPaGxx8u");

const VERIFICATION_TIMEOUT: i64 = 300;
const REQUIRED_CONSENSUS: u8 = 2;

#[program]
pub mod contracts {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, nodes: [Pubkey; 3]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.authorized_nodes = nodes;
        Ok(())
    }

    pub fn submit_request(
        ctx: Context<SubmitRequest>,
        cid_part1: String, 
        cid_part2: String,
        keywords: Vec<String>,
        payment_amount: u64,
    ) -> Result<()> {
        require!(payment_amount > 0, Errors::PaymentRequired);

        let request = &mut ctx.accounts.request_state;
        request.owner = ctx.accounts.owner.key();
        request.timestamp = Clock::get()?.unix_timestamp;
        request.payment_amount = payment_amount;
        request.is_processed = false;
        request.cid_part1 = cid_part1.clone();
        request.cid_part2 = cid_part2.clone();
        request.keywords = keywords.clone();
        request.result_root = [0; 32];

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: request.to_account_info(), 
            },
        );
        transfer(cpi_context, payment_amount)?; 
        let cid = format!("{}{}", cid_part1, cid_part2);
        emit!(VerificationRequested {
            cid: cid,
            keywords,
            owner: ctx.accounts.owner.key(),
        });
        Ok(())
    }

    pub fn submit_html_root(
        ctx: Context<SubmitHtmlRoot>,
        cid_part1: String,
        cid_part2: String,
        html_root: [u8; 32],
    ) -> Result<()> {
        let request = &mut ctx.accounts.request_state;
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer_node.key();

        require!(config.authorized_nodes.contains(&signer_key), Errors::Unauthorized); 
        require!(!request.is_processed, Errors::AlreadyProcessed);

        let has_voted = request.votes.iter().any(|v| v.node == signer_key);
        require!(!has_voted, Errors::AlreadyVoted);

        request.votes.push(Vote {
            node: signer_key,
            html_root,
        });

        let match_vote_count = request.votes.iter().filter(|v| v.html_root == html_root).count() as u8;

        if match_vote_count >= REQUIRED_CONSENSUS {
            request.is_processed = true;
            request.result_root = html_root;

            let pay_per_node = request.payment_amount / (match_vote_count as u64);
            
            for vote in request.votes.iter() {
                if vote.html_root == html_root {
                    let winner_account = if vote.node == ctx.accounts.node_a.key() {
                        &ctx.accounts.node_a
                    } else if vote.node == ctx.accounts.node_b.key() {
                        &ctx.accounts.node_b
                    } else {
                        &ctx.accounts.node_c
                    };
                    
                    **request.to_account_info().try_borrow_mut_lamports()? -= pay_per_node;
                    **winner_account.try_borrow_mut_lamports()? += pay_per_node;
                }
            }
            let cid = format!("{}{}", cid_part1, cid_part2);
            emit!(RequestCompleted {
                cid: cid,
                success: true,
            });
        }
        Ok(())
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>, cid_part1: String, cid_part2: String) -> Result<()> {
        let request = &ctx.accounts.request_state;
        let current_time = Clock::get()?.unix_timestamp;
        
        require!(!request.is_processed, Errors::AlreadyProcessed);
        require!(current_time > request.timestamp + VERIFICATION_TIMEOUT, Errors::TimeOutNotReached);
        
        let cid = format!("{}{}", cid_part1, cid_part2);
        emit!(RequestCompleted {
            cid: cid,
            success: false,
        });
        Ok(())
    }

    pub fn clean_expired_request(ctx: Context<CleanExpiredRequest>, cid_part1: String, cid_part2: String) -> Result<()> {
        let request = &ctx.accounts.request_state;
        let current_time = Clock::get()?.unix_timestamp;

        require!(!request.is_processed, Errors::AlreadyProcessed);
        require!(current_time > request.timestamp + VERIFICATION_TIMEOUT, Errors::TimeOutNotReached);

        let cid = format!("{}{}", cid_part1, cid_part2);
        emit!(RequestCompleted {
            cid: cid,
            success: false,
        });
        Ok(())
    }
}

//ACCOUNTS
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + (32*3),
        seeds = [b"global_config"],
        bump
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cid_part1: String, cid_part2: String)]
pub struct SubmitRequest<'info> {
    #[account(
        init,
        payer=owner,
        space= 8 + VerificationRequestRecord::INIT_SPACE, 
        seeds = [b"request", cid_part1.as_bytes(), cid_part2.as_bytes()],
        bump 
    )]
    pub request_state: Account<'info, VerificationRequestRecord>,

    #[account(mut)]
    pub owner: Signer<'info>, 
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cid_part1: String, cid_part2: String)]
pub struct SubmitHtmlRoot<'info> {
    #[account(mut)]
    pub signer_node: Signer<'info>,

    #[account(seeds = [b"global_config"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"request", cid_part1.as_bytes(), cid_part2.as_bytes()],
        bump
    )]
    pub request_state: Account<'info, VerificationRequestRecord>,

    /// CHECK:nodea
    #[account(mut, address=config.authorized_nodes[0])]
    pub node_a: AccountInfo<'info>,

    /// CHECK:nodeb
    #[account(mut, address=config.authorized_nodes[1])]
    pub node_b: AccountInfo<'info>,

    /// CHECK:nodec
    #[account(mut, address=config.authorized_nodes[2])]
    pub node_c: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(cid_part1: String, cid_part2: String)]
pub struct ClaimRefund<'info> {
    #[account(
        mut,
        seeds = [b"request", cid_part1.as_bytes(), cid_part2.as_bytes()],
        bump,
        has_one=owner @ Errors::Unauthorized,
        close=owner
    )]
    pub request_state: Account<'info, VerificationRequestRecord>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(cid_part1: String, cid_part2: String)]
pub struct CleanExpiredRequest<'info> {
    #[account(
        mut,
        seeds = [b"request", cid_part1.as_bytes(), cid_part2.as_bytes()],
        bump,
        close=caller
    )]
    pub request_state: Account<'info, VerificationRequestRecord>,

    #[account(mut)]
    pub caller: Signer<'info>, 
}

//STATES
#[account]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub authorized_nodes: [Pubkey; 3],
}


//getRequestDetails cid and resultroot
#[account]
#[derive(InitSpace)]
pub struct VerificationRequestRecord {
    pub owner: Pubkey,
    pub timestamp: i64,
    pub payment_amount: u64,
    pub is_processed: bool,
    #[max_len(30)] 
    pub cid_part1: String,
    #[max_len(20)] 
    pub cid_part2: String,
    pub result_root: [u8; 32],
    #[max_len(3)]
    pub votes: Vec<Vote>,
    #[max_len(10, 50)]
    pub keywords: Vec<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)] 
pub struct Vote {
    pub node: Pubkey,
    pub html_root: [u8; 32],
}

// EVENTS
#[event]
pub struct VerificationRequested {
    pub cid: String, 
    pub keywords: Vec<String>,
    pub owner: Pubkey,
}

#[event]
pub struct RequestCompleted {
    pub cid: String,
    pub success: bool
}

//ERRORS
#[error_code]
pub enum Errors {
    #[msg("Payment amount must be greater than 0")]
    PaymentRequired,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Request is already processed")]
    AlreadyProcessed,
    #[msg("Node is already voted")]
    AlreadyVoted,
    #[msg("Verification timeout has not been reached yet")]
    TimeOutNotReached,
}