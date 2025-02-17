import { makeClient, contractAddresses } from "@geekyrocks/alkahest-ts";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { CHAIN, ICreateListingRequest, IListing, TOKEN_DECIMALS } from "./api";
import { v4 as uuidv4 } from 'uuid';
import { createPublicClient, http } from "viem";

const USDC_ADDRESS = contractAddresses["Base Sepolia"].usdc as `0x${string}`;

export async function createEscrow(request: ICreateListingRequest): Promise<IListing> {
    if (!process.env.TWAS_PRIVATE_KEY || !process.env.TWAS_RPC_URL) {
        throw new Error("Missing environment variables");
    }

    const RPC_URL = process.env.TWAS_RPC_URL;
    const PRIVATE_KEY = `0x${process.env.TWAS_PRIVATE_KEY}`;

    console.log('createEscrow');
    // console.log(PRIVATE_KEY);
    console.log(RPC_URL);

    const publicClient = createPublicClient({
        chain: CHAIN,
        transport: http(RPC_URL)
    });

    // Create client for the seller
    const clientSeller = makeClient(
        privateKeyToAccount(PRIVATE_KEY as `0x${string}`, {
            nonceManager,
        }),
        CHAIN,
        RPC_URL
    );
    console.log('clientSeller', clientSeller.address);

    try {
        // Convert string amounts to BigInt with proper decimal places
        const amount = BigInt(request.sellTokenAmount);
        const price = BigInt(request.sellTokenPrice);
        const receiveAmount = amount * price / BigInt(BigInt(10) ** BigInt(TOKEN_DECIMALS));
        console.log('receiveAmount', receiveAmount);
        console.log('USDC_ADDRESS', USDC_ADDRESS);

        // Approve escrow contract to spend tokens
        const escrowApprovalHash = await clientSeller.erc20.approve(
            {
                address: request.sellTokenAddress,
                value: amount,
            },
            contractAddresses["Base Sepolia"].erc20EscrowObligation,
        );
        console.log('Approval transaction hash:', escrowApprovalHash);

        // Wait for approval transaction to be confirmed
        const approvalReceipt = await publicClient.waitForTransactionReceipt({
            hash: escrowApprovalHash as `0x${string}`
        });
        console.log('Approval confirmed in block:', approvalReceipt.blockNumber);

        // Create escrow demanding USDC for the token
        const escrow = await clientSeller.erc20.buyErc20ForErc20(
            {
                address: request.sellTokenAddress,
                value: amount,
            },
            {
                address: USDC_ADDRESS,
                value: receiveAmount,
            },
            BigInt(0)
        );
        console.log(escrow);

        // Return the escrow ID
        return {
            ...request,
            escrowId: escrow.attested.uid,
            receiveTokenAmount: receiveAmount.toString(),
            receiveTokenAddress: USDC_ADDRESS,
        };
    } catch (error) {
        console.error('Error creating escrow:', error);
        throw new Error('Failed to create escrow');
    }
}
