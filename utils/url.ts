import { Keypair } from "@solana/web3.js";
import _sodium from "libsodium-wrappers-sumo";
import bs58 from 'bs58'

const DEFAULT_HYPERLINK_KEYLENGTH = 12;
const DEFAULT_HASHLESS_HYPERLINK_KEYLENGTH = 16; // 16 bytes = 128 bits
const DEFAULT_ORIGIN = "http://localhost:3000";
export const HYPERLINK_ORIGIN =
    process !== undefined && process.env !== undefined
        ? process.env.HYPERLINK_ORIGIN_OVERRIDE ?? DEFAULT_ORIGIN
        : DEFAULT_ORIGIN;
const HYPERLINK_PATH = "/i";

const VERSION_DELIMITER = "_";

const VALID_VERSIONS = new Set([0, 1]);

const getSodium = async () => {
    await _sodium.ready;
    return _sodium;
};

const kdf = async (
    fullLength: number,
    pwShort: Uint8Array,
    salt: Uint8Array
) => {
    const sodium = await getSodium();
    return sodium.crypto_pwhash(
        fullLength,
        pwShort,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT
    );
};

const randBuf = async (l: number) => {
    const sodium = await getSodium();
    return sodium.randombytes_buf(l);
};

const kdfz = async (fullLength: number, pwShort: Uint8Array) => {
    const sodium = await getSodium();
    const salt = new Uint8Array(sodium.crypto_pwhash_SALTBYTES);
    return await kdf(fullLength, pwShort, salt);
};

const pwToKeypair = async (pw: Uint8Array) => {
    const sodium = await getSodium();
    const seed = await kdfz(sodium.crypto_sign_SEEDBYTES, pw);
    return Keypair.fromSeed(seed);
};

const pwToKeypairV1 = async (pw: Uint8Array) => {
    const sodium = await getSodium();
    const seed = sodium.pad(pw, sodium.crypto_sign_SEEDBYTES);
    return Keypair.fromSeed(seed);
};

export class HyperLink {
    url: URL;
    keypair: Keypair;

    private constructor(url: URL, keypair: Keypair) {
        this.url = url;
        this.keypair = keypair;
    }

    public static async create(version = 0): Promise<HyperLink> {
        if (!VALID_VERSIONS.has(version)) {
            throw Error("invalid version");
        }
        await getSodium();
        if (version === 1) {
            const b = await randBuf(DEFAULT_HASHLESS_HYPERLINK_KEYLENGTH);
            const keypair = await pwToKeypairV1(b);
            const hash = bs58.encode(b);
            const urlString = `${HYPERLINK_ORIGIN}${HYPERLINK_PATH}#${VERSION_DELIMITER}${hash}`;
            // can't assign hash as it causes an error in React Native
            const link = new URL(urlString);
            const hyperlink = new HyperLink(link, keypair);
            return hyperlink;
        } else {
            // version === 0
            const b = await randBuf(DEFAULT_HYPERLINK_KEYLENGTH);
            const keypair = await pwToKeypair(b);
            const hash = bs58.encode(b);
            const urlString = `${HYPERLINK_ORIGIN}${HYPERLINK_PATH}#${hash}`;
            // can't assign hash as it causes an error in React Native
            const link = new URL(urlString);
            const hyperlink = new HyperLink(link, keypair);
            return hyperlink;
        }
    }

    public static async fromUrl(url: URL): Promise<HyperLink> {
        console.log("url", url);
        let slug = url.hash.slice(1); // Extract the slug after the `#`
        console.log("slug", slug);
        let version = 0;
        if (slug.includes(VERSION_DELIMITER)) {
            const versionString = slug.split(VERSION_DELIMITER, 1)[0];
            if (versionString.length === 0) {
                version = 1;
            }
            slug = slug.split(VERSION_DELIMITER).slice(1).join(VERSION_DELIMITER);
        }

        const pw = Uint8Array.from(bs58.decode(slug));

        let keypair: Keypair;
        if (version === 1) {
            keypair = await pwToKeypairV1(pw);
        } else {
            keypair = await pwToKeypair(pw);
        }

        const hyperlink = new HyperLink(url, keypair);
        return hyperlink;
    }

    public static async fromLink(link: string): Promise<HyperLink> {
        const url = new URL(link);
        return this.fromUrl(url);
    }

    // public getLink(): string {
    // return this.url.toString();
    // }
}