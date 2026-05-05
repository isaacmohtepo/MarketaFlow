import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PublicHeader from "@/components/PublicHeader";
import Particles from "@/components/Particles";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <PublicHeader />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12">
        <Particles count={18} />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="blob blob-b"
            style={{
              width: 460,
              height: 460,
              top: "-80px",
              right: "-100px",
              background: "radial-gradient(circle, #3b5fff 0%, transparent 70%)",
            }}
          />
          <div
            className="blob blob-c"
            style={{
              width: 460,
              height: 460,
              bottom: "-100px",
              left: "-80px",
              background: "radial-gradient(circle, #ff2d55 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative w-full max-w-sm card p-8">
          <h1 className="text-2xl font-bold text-white">Crea tu agencia</h1>
          <p className="mt-1 text-sm text-zinc-400">14 días de Pro gratis. Sin tarjeta.</p>
          <div className="mt-6">
            <RegisterForm />
          </div>
          <p className="mt-6 text-sm text-zinc-400">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-semibold brand-gradient-text">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
