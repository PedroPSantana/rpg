import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { opDescriptor } from "@/modules/rules/systems/ordem-paranormal/descriptor";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mestre das Sombras — RPG com Mestre IA",
  description: "Campanhas de horror investigativo com um mestre de IA e regras resolvidas por software.",
};

const NAV = [
  { href: "/", label: "Campanhas" },
  { href: "/conhecimento", label: "Conhecimento" },
  { href: "/configuracoes", label: "Configurações" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-ink/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
            <Link href="/" className="flex items-center gap-2">
              <span aria-hidden className="grid size-7 place-items-center rounded-full border border-blood/60 text-blood">
                ◉
              </span>
              <span className="font-display text-lg tracking-wide">Mestre das Sombras</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-ash transition hover:bg-raised hover:text-bone">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line/70 px-4 py-4 text-center text-[11px] leading-relaxed text-dim">
          {opDescriptor.licenseNotice} Obra gratuita; aventuras, locais e criaturas são originais deste projeto.
        </footer>
      </body>
    </html>
  );
}
