import { isAdminSession } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { TrainingError } from "@/lib/training/errors";
import { exportVersion } from "@/lib/training/services/library";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  if (!isAdminSession(await getSessionContext())) return notFound();
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1) return notFound();
  try {
    const file = await exportVersion(prisma, number);
    return new Response(JSON.stringify(file, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="library-v${number}.json"`,
      },
    });
  } catch (e) {
    if (e instanceof TrainingError && e.code === "not_found") return notFound();
    throw e;
  }
}
