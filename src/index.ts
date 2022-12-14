import { Wallet, Provider, Program } from '@project-serum/anchor';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import { Connection, clusterApiUrl, Keypair, PublicKey } from '@solana/web3.js'

import * as splToken from '@solana/spl-token';
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { adminWallet, mintPubkey } from './config'

import { Marketplace } from './js/marketplace';
import { getCollectionPDA, getMarketplacePDA, getEscrowPDA } from './js/getPDAs'
import { Collection } from "./js/collection";

const CreateMarketplace = async () => {
    const connection = new Connection(clusterApiUrl("devnet"));

    // const admin = Keypair.fromSecretKey(new Uint8Array(adminWallet));
    const admin = Keypair.fromSecretKey(new Uint8Array(bs58.decode(adminWallet)));

    const anchorWallet = new Wallet(admin);

    let provider = new Provider(connection, anchorWallet, {
        preflightCommitment: 'recent',
    });


    const marketplaceMint = new splToken.Token(
        provider.connection,
        mintPubkey,
        splToken.TOKEN_PROGRAM_ID,
        admin
    );

    let adminTokenAccount = await Token.getAssociatedTokenAddress(splToken.ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, marketplaceMint.publicKey, admin.publicKey);
    const adminAccountInfo = await provider.connection.getAccountInfo(adminTokenAccount)
    if (adminAccountInfo === null) {
        await marketplaceMint.createAssociatedTokenAccount(
            admin.publicKey,
        );
        let adminNftATA = (await marketplaceMint.getOrCreateAssociatedAccountInfo(admin.publicKey)).address
        // console.log(adminNftATA, "adminNftATA----")
    } else {
        // console.log("already created.")
    }


    console.log(marketplaceMint.publicKey.toBase58(), "MarkeplaceMintPubkey")

    let marketplace = new Marketplace(provider);
    await marketplace.createMarketplace(admin, marketplaceMint.publicKey, 300, adminTokenAccount)

    let creator = new PublicKey("G4hS53oJHZRyt132iYAREZM2GMN2W4KrMKXB2zWWpW5u");
    let symbol = new PublicKey("G4hS53oJHZRyt132iYAREZM2GMN2W4KrMKXB2zWWpW5u");

    await marketplace.createCollection(admin, "G4hS53oJHZRyt132iYAREZM2GMN2W4KrMKXB2zWWpW5u", creator, symbol, false)

    console.log(marketplace.marketplacePDA.toBase58(), "marketplacePDA");

    let collectionPDA = await getCollectionPDA(marketplace.marketplacePDA, symbol);
    let collection = new Collection(provider, marketplace.marketplacePDA, collectionPDA);
    let result = await collection.getCollection();

    console.log(result.symbol.toBase58(), "collection");

}

const UpdateCollection = async () => {

    const connection = new Connection(clusterApiUrl("devnet"));

    const admin = Keypair.fromSecretKey(new Uint8Array(adminWallet));
    const anchorWallet = new Wallet(admin);

    let provider = new Provider(connection, anchorWallet, {
        preflightCommitment: 'recent',
    });

    const marketplacePDA = new PublicKey("B8jooLgndh3k6f7UdFyBSCFomuoFg8WG2Q614nKuN4dD");
    let marketplace = new Marketplace(provider, marketplacePDA);

    // let symbol = new PublicKey("2EZT51rkHsLdtDAdHkkPu3S34mjTezUGZNtgVQVHXHcp");
    let symbol = new PublicKey("51rWVP1Rb5fbys6wmoyuDir6yyumfCQSFcaCDef46baW");
    let collectionPDA = await getCollectionPDA(marketplace.marketplacePDA, symbol);

    let creator = new PublicKey("51rWVP1Rb5fbys6wmoyuDir6yyumfCQSFcaCDef46baW");

    await marketplace.updateCollection(admin, collectionPDA, 300, null, creator, false)

    let collection = new Collection(provider, marketplace.marketplacePDA, collectionPDA);
    let result = await collection.getCollection();

    console.log("success")
    console.log(result);
}

CreateMarketplace();
// UpdateCollection();