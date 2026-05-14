import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvalidLinkPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>This link is no longer valid</CardTitle>
          <CardDescription>
            If you&rsquo;ve already submitted your application, no further action needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            If you think this is wrong, contact your branch coordinator.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
