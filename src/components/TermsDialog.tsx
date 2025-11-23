import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TermsDialogProps {
  open: boolean;
  onAccept: () => void;
  canCancel?: boolean;
}

export function TermsDialog({ open, onAccept, canCancel = false }: TermsDialogProps) {
  const [accepting, setAccepting] = useState(false);
  const { toast } = useToast();

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { error } = await supabase
        .from("profiles")
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Terms Accepted",
        description: "Thank you for accepting our terms and data policy.",
      });
      onAccept();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh]">
        <AlertDialogHeader>
          <AlertDialogTitle>General Terms & Data Policy</AlertDialogTitle>
          <AlertDialogDescription>
            Please review and accept our terms and data protection policy to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="h-[50vh] pr-4">
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold text-foreground mb-2">Purpose of Data Collection</h3>
              <p className="text-muted-foreground">
                Performance data is collected solely for internal use within the club. The purpose is to support training, evaluate athletic performance, and facilitate improvement discussions among players, coaches, and club officials.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Data Protection & Handling</h3>
              <p className="text-muted-foreground">
                Only data strictly necessary for performance assessment and club management is processed. Sensitive or unrelated personal information is not stored or requested.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Confidentiality</h3>
              <p className="text-muted-foreground">
                Only authorized club members (players, coaches, administrators) may access or review performance data. External parties—including sponsors, external clubs, or the public—do not receive access.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">No Data Selling or Commercialization</h3>
              <p className="text-muted-foreground">
                Under no circumstances is player data shared with, sold to, or made available for third-party commercial use.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Your Rights</h3>
              <p className="text-muted-foreground">
                Every player may review their stored performance data and request corrections or deletion according to club policy. You can access your data at any time through this application.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Legal Compliance</h3>
              <p className="text-muted-foreground">
                The club complies with data protection laws applicable in its jurisdiction (e.g., GDPR in the EU, national privacy regulations).
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Transparent Data Use</h3>
              <p className="text-muted-foreground">
                Clear information about data use, storage, and access policies is available to all users directly in this app. You can review these terms at any time from the app menu.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Questions or Concerns</h3>
              <p className="text-muted-foreground">
                If you have any questions about our data protection practices or privacy policy, please contact your club administrator.
              </p>
            </section>
          </div>
        </ScrollArea>

        <AlertDialogFooter>
          {canCancel && <AlertDialogCancel>Cancel</AlertDialogCancel>}
          <AlertDialogAction onClick={handleAccept} disabled={accepting}>
            {accepting ? "Accepting..." : "I Accept"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}