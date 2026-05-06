import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CheckoutClient from "./CheckoutClient";

/**
 * Página intermedia que dispara el checkout. Recibe ?plan=pro&cycle=monthly
 * y delega al cliente que llama a /api/checkout y redirige a la URL de Wompi.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cycle?: string; agency?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const plan = sp.plan === "agency" ? "agency" : "pro";
  const cycle = sp.cycle === "yearly" ? "yearly" : "monthly";

  return <CheckoutClient plan={plan} cycle={cycle} agencyId={sp.agency} />;
}
