import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./LoginForm";

interface SearchParams {
  next?: string;
  reason?: string;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to your branch account</CardTitle>
          <CardDescription>Branch team members only.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={params.next} reason={params.reason} />
        </CardContent>
      </Card>
    </section>
  );
}
