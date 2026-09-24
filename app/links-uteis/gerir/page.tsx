import { redirect } from "next/navigation";

// Management now happens inline on the public page; old links keep working.
export default async function UsefulLinksManagementRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { novo } = await searchParams;
  redirect(novo === "1" ? "/links-uteis/?novo=1" : "/links-uteis/");
}
