import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Confirmation shown after the chairman signs via the passwordless link.
 * Static — the magic link is consumed at this point, so we don't re-verify.
 */
export default function ChairmanSignDonePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Signed — thank you
        </h1>
        <p className="text-text-secondary">
          Your signature has been recorded.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-text-secondary">
          <p>
            The application now goes back to the Branch Admin team, who will forward
            it to HQ. There&rsquo;s nothing more for you to do.
          </p>
          <Alert variant="info">
            <AlertDescription>
              You can close this tab. This signing link has now been used and
              won&rsquo;t work again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
