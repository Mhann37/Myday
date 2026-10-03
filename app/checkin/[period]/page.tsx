import { notFound } from "next/navigation";
import { CheckinForm } from "@/components/checkin/CheckinForm";
import { dateSchema, periodSchema } from "@/lib/schema";

export default async function CheckinPage({ params, searchParams }: PageProps<"/checkin/[period]">) {
  const { period } = await params;
  const parsed = periodSchema.safeParse(period);
  if (!parsed.success) notFound();

  const { date } = await searchParams;
  const validDate = typeof date === "string" && dateSchema.safeParse(date).success ? date : undefined;

  return <CheckinForm period={parsed.data} date={validDate} />;
}
