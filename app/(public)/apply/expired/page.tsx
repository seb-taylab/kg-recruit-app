import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExpiredLinkPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>This link has expired</CardTitle>
          <CardDescription>
            Please contact your branch coordinator for a new invite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            For security, invitation links expire after a set time. Your branch admin can send you a fresh one.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
