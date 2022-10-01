import * as anchor from '@project-serum/anchor'
import { Marketplace as MarketplaceDefinition, IDL } from './types/marketplace'
import { MARKETPLACE_PROGRAM_ID } from './constant'
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getAssociatedTokenAddress, getNftVaultPDA, getSellOrderPDA } from './getPDAs'
import { getMetadata } from './metaplex'
import { programs } from '@metaplex/js'
import * as idl from './types/marketplace'
import { IdlAccounts, web3 } from "@project-serum/anchor";

const { Metadata } =
    programs.metadata

export class Collection {
    program: anchor.Program<MarketplaceDefinition>
    marketplacePDA: PublicKey
    collectionPDA: PublicKey

    private collectionCache?: IdlAccounts<MarketplaceDefinition>["collection"]

    constructor(
        provider: anchor.Provider,
        marketplacePDA: PublicKey,
        collectionPDA: PublicKey,
    ) {
        // @ts-ignore
        this.program = new anchor.Program(idl, MARKETPLACE_PROGRAM_ID, provider)

        this.marketplacePDA = marketplacePDA
        this.collectionPDA = collectionPDA
    }

    async sellAssetInstruction(
        nftMint: PublicKey,
        sellerNftAccount: PublicKey,
        sellerDestination: PublicKey,
        solPrice: anchor.BN,
        tokenPrice: anchor.BN,
        amount: anchor.BN,
        seller: PublicKey,
    ): Promise<TransactionInstruction> {
        let programNftVaultPDA = await getNftVaultPDA(nftMint)
        let sellOrderPDA = await getSellOrderPDA(sellerNftAccount, solPrice, tokenPrice);

        let metadataPDA = await Metadata.getPDA(nftMint)
        return await this.program.methods.createSellOrder(solPrice, tokenPrice, amount, sellerDestination).accounts(
            {
                payer: seller,
                sellerNftTokenAccount: sellerNftAccount,
                marketplace: this.marketplacePDA,
                collection: this.collectionPDA,
                mint: nftMint,
                metadata: metadataPDA,
                vault: programNftVaultPDA,
                sellOrder: sellOrderPDA,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            }
        ).instruction()
    }

    async sellAsset(
        nftMint: PublicKey,
        sellerNftAccount: PublicKey,
        sellerDestination: PublicKey,
        solPrice: anchor.BN,
        tokenPrice: anchor.BN,
        amount: anchor.BN,
        seller: PublicKey
    ): Promise<string> {
        let ix = await this.sellAssetInstruction(
            nftMint, sellerNftAccount, sellerDestination,
            solPrice, tokenPrice, amount, seller
        )
        return this._sendInstruction(ix, [])
    }

    async removeSellOrderInstruction(
        nftMint: PublicKey,
        sellerNftAccount: PublicKey,
        sellOrderPDA: PublicKey,
        amount: anchor.BN,
        seller: PublicKey,
    ): Promise<TransactionInstruction> {
        const programNftVaultPDA = await getNftVaultPDA(nftMint)
        return await this.program.methods.removeSellOrder(amount).accounts({
            authority: seller,
            sellerNftTokenAccount: sellerNftAccount,
            vault: programNftVaultPDA,
            sellOrder: sellOrderPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }).instruction()
    }

    async removeSellOrder(
        nftMint: PublicKey,
        sellerNftAccount: PublicKey,
        sellOrderPDA: PublicKey,
        amount: anchor.BN,
        seller: Keypair,
    ): Promise<string> {
        const ix = await this.removeSellOrderInstruction(
            nftMint,
            sellerNftAccount,
            sellOrderPDA,
            amount,
            seller.publicKey,
        )
        return this._sendInstruction(ix, [seller])
    }

    async addToSellOrderInstruction(
        nftMint: PublicKey,
        sellerNftAccount: PublicKey,
        sellOrderPDA: PublicKey,
        amount: anchor.BN,
        seller: PublicKey,
    ): Promise<TransactionInstruction> {
        const programNftVaultPDA = await getNftVaultPDA(nftMint)
        return await this.program.methods.addQuantityToSellOrder(amount).accounts({
            authority: seller,
            sellerNftTokenAccount: sellerNftAccount,
            vault: programNftVaultPDA,
            sellOrder: sellOrderPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }).instruction()
    }

    async addToSellOrder(
        nftMint: PublicKey,
        sellerNftAccount: PublicKey,
        sellOrderPDA: PublicKey,
        amount: anchor.BN,
        seller: Keypair,
    ): Promise<string> {
        const ix = await this.addToSellOrderInstruction(
            nftMint,
            sellerNftAccount,
            sellOrderPDA,
            amount,
            seller.publicKey,
        )
        return this._sendInstruction(ix, [seller])
    }

    async buyInstruction(
        nftMint: PublicKey,
        sellOrdersPDA: PublicKey[],
        buyerNftAccount: PublicKey,
        buyerPayingAccount: PublicKey,
        wanted_quantity: anchor.BN,
        buyer: PublicKey,
    ): Promise<TransactionInstruction> {
        const programNftVaultPDA = await getNftVaultPDA(nftMint)
        const marketplaceAccount = await this.program.account.marketplace.fetch(this.marketplacePDA)

        const metadata = await getMetadata(
            anchor.getProvider().connection,
            nftMint,
        )


        // let metadataPDA = await Metadata.getPDA(nftMint)

        const collection = await this.getCollection()
        const creatorsAccounts = []

        if (!collection.ignoreCreatorFee) {
            for (const creator of metadata.data.creators) {
                const creatorAddress = new PublicKey(creator.address)
                const creatorATA = await getAssociatedTokenAddress(creatorAddress, marketplaceAccount.mint)

                creatorsAccounts.push(
                    { pubkey: creatorATA, isWritable: true, isSigner: false },
                )
            }
        }

        const sellOrders = []
        for (const sellOrderPDA of sellOrdersPDA) {
            const so = await this.program.account.sellOrder.fetch(sellOrderPDA)
            sellOrders.push({ pubkey: sellOrderPDA, isWritable: true, isSigner: false })
            sellOrders.push({ pubkey: so.destination, isWritable: true, isSigner: false })
        }

        return await this.program.methods.buy(wanted_quantity).accounts({
            buyer,
            buyerNftTokenAccount: buyerNftAccount,
            buyerPayingTokenAccount: buyerPayingAccount,
            marketplace: this.marketplacePDA,
            marketplaceDestAccount: marketplaceAccount.feesDestination,
            collection: this.collectionPDA,
            // metadata: await Metadata.getPDA(metadata.mint),
            metadata: await Metadata.getPDA(nftMint),
            vault: programNftVaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
        }).remainingAccounts([
            ...creatorsAccounts,
            ...sellOrders,
        ]).instruction()
    }

    async buy(
        nftMint: PublicKey,
        sellOrdersPDA: PublicKey[],
        buyerNftAccount: PublicKey,
        buyerPayingAccount: PublicKey,
        wanted_quantity: anchor.BN,
        buyer: Keypair,
    ): Promise<string> {
        const ix = await this.buyInstruction(
            nftMint,
            sellOrdersPDA,
            buyerNftAccount,
            buyerPayingAccount,
            wanted_quantity,
            buyer.publicKey,
        )

        return this._sendInstruction(ix, [buyer])
    }

    async getCollection(): Promise<IdlAccounts<MarketplaceDefinition>["collection"]> {
        if (this.collectionCache) {
            return this.collectionCache
        }
        this.collectionCache = await this.program.account.collection.fetch(this.collectionPDA)
        return this.collectionCache
    }

    _sendInstruction(ix: TransactionInstruction, signers: Keypair[]): Promise<string> {
        const tx = new web3.Transaction()
        tx.add(ix)
        return this.program.provider.send(tx, signers)
    }
}