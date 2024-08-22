"use client";
import React, { useState, useEffect } from "react";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import background from "../../public/assets/images/background.jpg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bookmark,
  ChevronRight,
  Copy,
  Loader,
  QrCodeIcon,
  Wallet,
} from "lucide-react";
import { HyperLink } from "@/utils/url";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "flowbite-react";
import WalletModal from "@/components/WalletModal";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSolanaTransfer } from "@/app/hooks/useSolanaTransfer";

interface HyperLinkData {
  keypair: {
    publicKey: PublicKey;
    secretKey: Uint8Array;
  };
  url: URL;
}

const HyperLinkCard: React.FC = () => {
  const [hyperlink, setHyperlink] = useState<HyperLinkData | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [usdBalance, setUsdBalance] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [url, setUrl] = useState<URL>(new URL(window.location.href));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  const { publicKey } = useWallet();

  useEffect(() => {
    loadHyperLink();
  }, [isLoading]);

  const loadHyperLink = async () => {
    const hash = window.location.hash.slice(1);
    setUrl(new URL(window.location.href));
    if (hash) {
      const url = `${process.env.NEXT_PUBLIC_HYPERLINK_ORIGIN}#${hash}`;
      try {
        const hyperlinkInstance = await HyperLink.fromLink(url);
        setHyperlink(hyperlinkInstance);
        await fetchBalance(hyperlinkInstance);
      } catch (err) {
        setError("Invalid HyperLink");
      }
    }
  };
  const fetchBalance = async (
    hyperlinkInstance: HyperLinkData
  ): Promise<void> => {
    try {
      const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed"
      );
      const balance = await connection.getBalance(
        hyperlinkInstance.keypair.publicKey
      );
      const solBalance = balance / LAMPORTS_PER_SOL;
      setBalance(solBalance);
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      const data: { solana: { usd: number } } = await response.json();
      setUsdBalance(solBalance * data.solana.usd);
    } catch (err) {
      console.error("Error fetching balance:", err);
      setError("Error fetching balance.");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(url.href);
    toast("Copied to clipboard");
  };

  const handleBookmark = () => {
    if ((window as any).external && (window as any).external.AddFavorite) {
      (window as any).external.AddFavorite(window.location.href, "HyperLink");
    } else {
      toast(
        `Press ${
          navigator.userAgent.toLowerCase().includes("mac") ? "Cmd" : "Ctrl"
        } + D to bookmark this page.`
      );
    }
  };

  const createLinkAndTransfer = async () => {
    if (!hyperlink) {
      setError("No HyperLink available to transfer from.");
      return;
    }

    try {
      setIsLoading(true);
      const newHyperlink = await HyperLink.create(0);
      const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed"
      );
      const currentBalance = await connection.getBalance(
        hyperlink.keypair.publicKey
      );
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: hyperlink.keypair.publicKey,
          toPubkey: newHyperlink.keypair.publicKey,
          lamports: currentBalance - 5000,
        })
      );

      transaction.feePayer = hyperlink.keypair.publicKey;
      transaction.recentBlockhash = blockhash;

      const hyperlinkInstance = await HyperLink.fromLink(window.location.href);
      if (!hyperlinkInstance || !hyperlinkInstance.keypair) {
        throw new Error("Invalid HyperLink or missing keypair");
      }
      transaction.sign(hyperlinkInstance.keypair);

      const signature = await connection.sendRawTransaction(
        transaction.serialize()
      );
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${confirmation.value.err.toString()}`
        );
      }

      setHyperlink(newHyperlink);
      await fetchBalance(hyperlink);
      await fetchBalance(newHyperlink);
      setUrl(new URL(newHyperlink.url));
      window.open(newHyperlink.url.toString(), "_blank");
      setIsLoading(false);
    } catch (err) {
      console.error("Error:", err);
      setError(`Error creating new HyperLink or transferring funds: ${err}`);
    }
  };
  const handleTransfer = async () => {
    if (!publicKey || !balance || !hyperlink) {
      toast.error("Missing required information for transfer.");
      return;
    }

    setIsLoading(true);

    try {
      const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed"
      );
      const amount = balance * LAMPORTS_PER_SOL;
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: hyperlink.keypair.publicKey,
          toPubkey: publicKey,
          lamports: amount - 5000,
        })
      );
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = hyperlink.keypair.publicKey;
      // Sign the transaction
      transaction.sign(hyperlink.keypair);
      // Send and confirm the transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [hyperlink.keypair]
      );

      console.log(`Transfer successful! Signature: ${signature}`);
      toast.success(`Transfer successful! Signature: ${signature}`);

      await fetchBalance(hyperlink);
    } catch (error) {
      console.error("Transfer error:", error);
      toast.error(
        `Transfer failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // if (error) {
  //   return (
  //     <Card className="w-full max-w-md mx-auto my-auto">
  //       <CardContent className="pt-6">
  //         <p className="text-red-500 text-center">{error}</p>
  //       </CardContent>
  //     </Card>
  //   );
  // }

  // if (!hyperlink) {
  //   return (
  //     <Card className="w-full max-w-md mx-auto">
  //       <CardContent className="pt-6">
  //         <p className="text-center">Loading HyperLink...</p>
  //       </CardContent>
  //     </Card>
  //   );
  // }

  return (
    <Card className="w-full h-full max-w-xl mx-auto my-10">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center justify-center">
          This is ${usdBalance?.toFixed(2)} in crypto
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-lg font-thin text-center">
          The link to this page contains this value. Make sure you don't lose
          it!
        </p>
        <div className="flex justify-center items-center">
          <Badge className="text-base sm:text-lg md:text-xl p-2 sm:p-3 md:p-4 px-3 sm:px-4 md:px-5">
            {url.href}
          </Badge>
        </div>
        <div className="flex justify-center items-center gap-3">
          <Button onClick={handleCopy} className="h-[80px] flex-1">
            <div className="flex flex-col items-center">
              <Copy />
              <span>Copy</span>
            </div>
          </Button>
          <Button onClick={handleBookmark} className="h-[80px] flex-1">
            <div className="flex flex-col items-center">
              <Bookmark />
              <span>Bookmark</span>
            </div>
          </Button>
          <Button className="h-[80px] flex-1">
            <div className="flex flex-col items-center">
              <QrCodeIcon />
              <span>QR code</span>
            </div>
          </Button>
        </div>
        {balance !== null && (
          <div
            className="rounded-xl shadow-lg p-6 flex flex-row justify-between"
            style={{ backgroundImage: `url(${background.src})` }}
          >
            <div className="flex flex-col items-start">
              <div className="mt-6 sm:mt-8 md:mt-10 lg:mt-12 xl:mt-16">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl leading-tight md:leading-normal font-bold">
                  Your
                </h1>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl leading-tight md:leading-normal font-bold">
                  Balance
                </h1>
              </div>
              <div className="mt-6 sm:mt-8 md:mt-10 lg:mt-12 xl:mt-16">
                <Badge className="text-lg">{url.hash}</Badge>
              </div>
            </div>
            <div>
              <div className="text-center mt-6 sm:mt-8 md:mt-10 lg:mt-12 xl:mt-16">
                <p className="text-pink-400">{balance.toFixed(4)} SOL</p>
                {usdBalance && (
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
                    ${usdBalance.toFixed(2)}
                  </h1>
                )}
              </div>
              <div className="flex justify-end mt-10 sm:mt-6 md:mt-8 lg:mt-14 xl:mt-[7rem] ">
                <p className="text-gray-400 text-xs">POWERED BY Hyperlink</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-center items-center gap-3">
          <Button className="w-full">Send</Button>
          <Button onClick={() => setShowQrModal(true)} className="w-full">
            Receive
          </Button>

          {showQrModal && hyperlink?.keypair?.publicKey && (
            <WalletModal
              isVisible={showQrModal}
              onClose={() => setShowQrModal(false)}
              publicKey={hyperlink?.keypair?.publicKey.toBase58().toString()}
            />
          )}
        </div>
        <Separator className="my-10" />
        <div className="flex w-full flex-col justify-start space-y-5 xs:space-y-0 xs:flex-row xs:space-x-10">
          <Button
            onClick={createLinkAndTransfer}
            className="flex justify-between text-base font-medium p-10 xs:w-full xs:text-base"
          >
            <div className="flex items-start justify-start gap-2 sm:gap-4 md:gap-6 lg:gap-8 xl:gap-[10px]">
              <div className="flex items-center justify-center align-middle mt-2 rounded-full bg-grey-50 xs:p-3">
                <Wallet />
              </div>
              <div className="flex-col items-start justify-start rounded-full bg-grey-50 xs:p-3">
                <div className="text-left">Recreate this Hyperlink</div>
                <div className="text-left text-xs font-normal text-grey-500">
                  <div>
                    <div className="block md:hidden">
                      <div>Move the entire value to a new</div>
                      <div>Hyperlink so only you have the link.</div>
                    </div>
                    <div className="hidden md:block">
                      Move the entire value to a new Hyperlink so only you have
                      the link.
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {isLoading ? <Spinner /> : <ChevronRight />}
          </Button>
          <Button
            onClick={handleTransfer}
            className="flex justify-between text-base font-medium p-10 xs:w-full xs:text-base"
          >
            <div className="flex items-start justify-start gap-[10px]">
              <div className="flex items-center justify-center align-middle mt-2 rounded-full bg-grey-50 xs:p-3">
                <Wallet />
              </div>
              <div className="flex-col items-start justify-start rounded-full bg-grey-50 xs:p-3">
                <div className="text-left">Withdraw to your wallet</div>
                <div className="text-left text-xs font-normal text-grey-500">
                  <div className="block md:hidden">
                    <div>Withdraw the entire value to your </div>
                    <div>connected wallet.</div>
                  </div>
                  <div className="hidden md:block">
                    Withdraw the entire value to your connected wallet.
                  </div>
                </div>
              </div>
            </div>
            <ChevronRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default HyperLinkCard;
