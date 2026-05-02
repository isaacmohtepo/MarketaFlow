import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PublicHeader from "@/components/PublicHeader";
import Particles from "@/components/Particles";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <PublicHeader />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12">
        <Particles count={18} />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="blob blob-a"
            style={{
              width: 420,
              height: 420,
              top: "-80px",
              left: "-100px",
              background: "radial-gradient(circle, #8a2be2 0%, transparent 70%)",
            }}
          />
          <div
            className="blob blob-c"
            style={{
              width: 420,
              height: 420,
              bottom: "-100px",
              right: "-80px",
              background: "radial-gradient(circle, #ff4d8f 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative w-full max-w-sm card p-8">
          <h1 className="text-2xl font-bold text-white">Bienvenido</h1>
          <p className="mt-1 text-sm text-zinc-400">Inicia sesión para continuar.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
          <p className="mt-6 text-sm text-zinc-400">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-semibold brand-gradient-text">
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
