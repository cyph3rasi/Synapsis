
/**
 * Synapsis Double Ratchet & X3DH Implementation
 * 
 * Implements the Double Ratchet Algorithm + X3DH Key Agreement.
 * Adheres to Signal specifications using the "SynapsisV2" HKDF info binding.
 */

import {
    KeyPair,
    computeSharedSecret,
    hkdf,
    encrypt as aeadEncrypt,
    decrypt as aeadDecrypt,
    importX25519PublicKey,
    exportKey,
    generateX25519KeyPair,
    base64ToArrayBuffer,
    arrayBufferToBase64
} from './e2ee';

// Constants
const KDF_INFO = 'SynapsisV2';
const RK_SIZE = 32; // 32 bytes for Root Key
const CK_SIZE = 32; // 32 bytes for Chain Key
const MK_SIZE = 32; // 32 bytes for Message Key

export interface RatchetState {
    // DH Ratchet
    dhPair: KeyPair;
    remoteDhPub: CryptoKey;
    rootKey: ArrayBuffer;

    // Symm Ratchets
    chainKeySend: ArrayBuffer;
    chainKeyRecv: ArrayBuffer;

    // Message Numbers
    ns: number; // Send count
    nr: number; // Recv count
    pn: number; // Previous chain count
}

export interface Header {
    dh: string; // Base64 public key
    pn: number;
    n: number;
}

export interface CiphertextMessage {
    header: Header;
    ciphertext: string;
    iv: string;
}

// ----------------------------------------------------------------------------
// 1. X3DH Key Agreement
// ----------------------------------------------------------------------------

export async function x3dhSender(
    aliceIdentity: KeyPair,
    bobBundle: {
        identityKey: CryptoKey,
        signedPreKey: CryptoKey,
        oneTimeKey?: CryptoKey
    },
    contextInfo: string // "SynapsisV2" + DIDs + DeviceIDs
): Promise<{ sk: ArrayBuffer, ephemeralKey: KeyPair }> {

    // 1. Generate Ephemeral Key (EK_a)
    const ephemeralKey = await generateX25519KeyPair();

    // 2. DH1 = DH(IK_a, SPK_b)
    const dh1 = await computeSharedSecret(aliceIdentity.privateKey, bobBundle.signedPreKey);

    // 3. DH2 = DH(EK_a, IK_b)
    const dh2 = await computeSharedSecret(ephemeralKey.privateKey, bobBundle.identityKey);

    // 4. DH3 = DH(EK_a, SPK_b)
    const dh3 = await computeSharedSecret(ephemeralKey.privateKey, bobBundle.signedPreKey);

    // 5. DH4 = DH(EK_a, OPK_b) -- Optional
    let dh4: ArrayBuffer | undefined;
    if (bobBundle.oneTimeKey) {
        dh4 = await computeSharedSecret(ephemeralKey.privateKey, bobBundle.oneTimeKey);
    }

    // 6. Concatenate
    const km = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength + (dh4 ? dh4.byteLength : 0));
    let offset = 0;
    km.set(new Uint8Array(dh1), offset); offset += dh1.byteLength;
    km.set(new Uint8Array(dh2), offset); offset += dh2.byteLength;
    km.set(new Uint8Array(dh3), offset); offset += dh3.byteLength;
    if (dh4) km.set(new Uint8Array(dh4), offset);

    // 7. KDF
    // Output 32 bytes for Root Key
    const encoder = new TextEncoder();
    return {
        sk: await hkdf(new Uint8Array(32), km.buffer, encoder.encode(contextInfo), 32),
        ephemeralKey
    };
}

export async function x3dhReceiver(
    bobIdentity: KeyPair,
    bobSignedPreKey: KeyPair,
    bobOneTimeKey: KeyPair | undefined, // The one used by Alice
    aliceIdentityKey: CryptoKey,
    aliceEphemeralKey: CryptoKey,
    contextInfo: string
): Promise<ArrayBuffer> {

    // 1. DH1 = DH(SPK_b, IK_a) -- Note: Order of keys in computeSharedSecret usually (private, public)
    const dh1 = await computeSharedSecret(bobSignedPreKey.privateKey, aliceIdentityKey);

    // 2. DH2 = DH(IK_b, EK_a)
    const dh2 = await computeSharedSecret(bobIdentity.privateKey, aliceEphemeralKey);

    // 3. DH3 = DH(SPK_b, EK_a)
    const dh3 = await computeSharedSecret(bobSignedPreKey.privateKey, aliceEphemeralKey);

    // 4. DH4 = DH(OPK_b, EK_a)
    let dh4: ArrayBuffer | undefined;
    if (bobOneTimeKey) {
        dh4 = await computeSharedSecret(bobOneTimeKey.privateKey, aliceEphemeralKey);
    }

    const km = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength + (dh4 ? dh4.byteLength : 0));
    let offset = 0;
    km.set(new Uint8Array(dh1), offset); offset += dh1.byteLength;
    km.set(new Uint8Array(dh2), offset); offset += dh2.byteLength;
    km.set(new Uint8Array(dh3), offset); offset += dh3.byteLength;
    if (dh4) km.set(new Uint8Array(dh4), offset);

    const encoder = new TextEncoder();
    return await hkdf(new Uint8Array(32), km.buffer, encoder.encode(contextInfo), 32);
}

// ----------------------------------------------------------------------------
// 2. KDF Chains (Symmetric Ratchet)
// ----------------------------------------------------------------------------

// Constants for HMAC
const ONE = new Uint8Array([0x01]);
const TWO = new Uint8Array([0x02]);

async function kdfChain(ck: ArrayBuffer): Promise<{ ck: ArrayBuffer, mk: ArrayBuffer }> {
    // HMAC-SHA256(CK, 1) -> MK
    // HMAC-SHA256(CK, 2) -> NextCK
    // Implementing via HKDF for simplicity/consistency or WebCrypto HMAC

    // Actually standard says:
    // HMAC-SHA256(ck, input)
    // We can use HKDF-Expand logic here or pure hmac.
    // Let's use custom HKDF expand with fixed info
    const mk = await hkdf(new Uint8Array(0), ck, ONE, 32);
    const nextCk = await hkdf(new Uint8Array(0), ck, TWO, 32);

    return { ck: nextCk, mk };
}

// ----------------------------------------------------------------------------
// 3. DHRatchet (Root Chain)
// ----------------------------------------------------------------------------

async function kdfRoot(rootKey: ArrayBuffer, dhOut: ArrayBuffer): Promise<{ rootKey: ArrayBuffer, chainKey: ArrayBuffer }> {
    // HKDF(root, dh, info, 64) -> 32 root, 32 chain
    const encoder = new TextEncoder();
    const output = await hkdf(
        rootKey,
        dhOut,
        encoder.encode("SynapsisRatchet"),
        64
    );

    const bytes = new Uint8Array(output);
    return {
        rootKey: bytes.slice(0, 32).buffer,
        chainKey: bytes.slice(32, 64).buffer
    };
}

// ----------------------------------------------------------------------------
// 4. Initializers
// ----------------------------------------------------------------------------

export async function initSender(
    sharedSecret: ArrayBuffer,
    bobRatchetKey: CryptoKey
): Promise<RatchetState> {
    const dhPair = await generateX25519KeyPair();

    // Sender starts by sending a new DH ratchet.
    // Root Key = sharedSecret.
    // First, we need to generate a chain key for sending.
    // Standard: Alice initializes with SK. Bob's ratchet key is remote.
    // Alice generates `dhPair`.
    // She performs a DH ratchet Step immediately?
    // Protocol:
    // Alice: RK = SK.
    // Alice performs DH(alice_priv, bob_pub).
    //  Calculates RK, CK_send.

    const dhOut = await computeSharedSecret(dhPair.privateKey, bobRatchetKey);
    const kdf = await kdfRoot(sharedSecret, dhOut);

    return {
        dhPair,
        remoteDhPub: bobRatchetKey,
        rootKey: kdf.rootKey,
        chainKeySend: kdf.chainKey,
        chainKeyRecv: new Uint8Array(0).buffer, // Empty until Bob replies
        ns: 0,
        nr: 0,
        pn: 0
    };
}

export async function initReceiver(
    sharedSecret: ArrayBuffer,
    bobDhKeyPair: KeyPair // This is the SPK key pair used in X3DH
): Promise<RatchetState> {
    // Bob: RK = SK.
    // Bob has consistent state.
    return {
        dhPair: bobDhKeyPair,
        remoteDhPub: bobDhKeyPair.publicKey, // Placeholder, will be updated on first msg
        rootKey: sharedSecret,
        chainKeySend: new Uint8Array(0).buffer,
        chainKeyRecv: new Uint8Array(0).buffer, // Will be derived on first msg
        ns: 0,
        nr: 0,
        pn: 0
    };
}

// ----------------------------------------------------------------------------
// 5. Encrypt / Decrypt Message
// ----------------------------------------------------------------------------

export async function ratchetEncrypt(
    state: RatchetState,
    plaintext: string
): Promise<{
    ciphertext: CiphertextMessage,
    newState: RatchetState
}> {
    // 1. Advance chain
    const { ck: nextCk, mk } = await kdfChain(state.chainKeySend);
    state.chainKeySend = nextCk;

    // 2. Encrypt
    const header: Header = {
        dh: await exportKey(state.dhPair.publicKey),
        pn: state.pn,
        n: state.ns
    };

    const associatedData = new TextEncoder().encode(JSON.stringify(header));
    const encrypted = await aeadEncrypt(mk, plaintext, associatedData);

    state.ns += 1;

    return {
        ciphertext: {
            header,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv
        },
        newState: state
    };
}

// Note: Decryption requires handling out-of-order messages and ratcheting steps.
// This is complex logic. For V2.1 baseline, we implement the core ratcheting step if header key differs.

export async function ratchetDecrypt(
    state: RatchetState,
    message: CiphertextMessage
): Promise<{ plaintext: string, newState: RatchetState }> {
    // Check if DH ratchet step needed
    // If message.header.dh != state.remoteDhPub

    // Note: Comparing CryptoKeys directly is hard. We compare Base64 export.
    const remoteKeyStr = await exportKey(state.remoteDhPub);

    if (message.header.dh !== remoteKeyStr) {
        // Ratchet Step!
        const newRemoteKey = await importX25519PublicKey(message.header.dh);

        // 1. DHRatchet(remote_new) -> RX step
        const dhOut1 = await computeSharedSecret(state.dhPair.privateKey, newRemoteKey);
        const kdf1 = await kdfRoot(state.rootKey, dhOut1);
        state.rootKey = kdf1.rootKey;
        state.chainKeyRecv = kdf1.chainKey;

        // 2. Sender step (We generate new key)
        state.pn = state.ns;
        state.ns = 0;
        state.nr = 0;
        state.dhPair = await generateX25519KeyPair();

        // 3. DHRatchet(remote_new) -> TX step
        const dhOut2 = await computeSharedSecret(state.dhPair.privateKey, newRemoteKey);
        const kdf2 = await kdfRoot(state.rootKey, dhOut2);
        state.rootKey = kdf2.rootKey;
        state.chainKeySend = kdf2.chainKey;

        state.remoteDhPub = newRemoteKey;
    }

    // 3. Symmetric Ratchet to catch up to n
    // (Skipping skipped-message buffering for now - assumes ordered delivery for V2.1 baseline)

    // Advance Chain Recv to n
    // Real impl buffers skipped keys.
    // Warning: If n > nr, we must loop.
    // For now, assuming direct sequence.

    const { ck: nextCk, mk } = await kdfChain(state.chainKeyRecv);
    state.chainKeyRecv = nextCk;
    state.nr += 1;

    // 4. Decrypt
    const associatedData = new TextEncoder().encode(JSON.stringify(message.header));
    const plaintext = await aeadDecrypt(mk, message.ciphertext, message.iv, associatedData);

    return { plaintext, newState: state };
}
