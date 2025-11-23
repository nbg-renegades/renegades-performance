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
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Languages } from "lucide-react";

interface TermsDialogProps {
  open: boolean;
  onAccept: () => void;
  canCancel?: boolean;
}

export function TermsDialog({ open, onAccept, canCancel = false }: TermsDialogProps) {
  const [accepting, setAccepting] = useState(false);
  const [language, setLanguage] = useState<"en" | "de">("en");
  const { toast } = useToast();

  const toggleLanguage = () => {
    setLanguage(prev => prev === "en" ? "de" : "en");
  };

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
        title: language === "en" ? "Terms Accepted" : "Bedingungen Akzeptiert",
        description: language === "en" 
          ? "Thank you for accepting our terms and data policy."
          : "Vielen Dank für die Akzeptanz unserer Bedingungen und Datenschutzrichtlinie.",
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
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <AlertDialogTitle>
                {language === "en" ? "General Terms & Data Policy" : "Allgemeine Geschäftsbedingungen & Datenschutzrichtlinie"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {language === "en" 
                  ? "Please review and accept our terms and data protection policy to continue."
                  : "Bitte lesen und akzeptieren Sie unsere Bedingungen und Datenschutzrichtlinie, um fortzufahren."}
              </AlertDialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="ml-2 shrink-0"
            >
              <Languages className="h-4 w-4 mr-1" />
              {language === "en" ? "DE" : "EN"}
            </Button>
          </div>
        </AlertDialogHeader>

        <ScrollArea className="h-[50vh] pr-4">
          {language === "en" ? (
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
          ) : (
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold text-foreground mb-2">Zweck der Datenerhebung</h3>
                <p className="text-muted-foreground">
                  Leistungsdaten werden ausschließlich für den internen Gebrauch innerhalb des Vereins erhoben. Der Zweck ist die Unterstützung des Trainings, die Bewertung der sportlichen Leistung und die Erleichterung von Verbesserungsgesprächen zwischen Spielern, Trainern und Vereinsvertretern.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Datenschutz & Handhabung</h3>
                <p className="text-muted-foreground">
                  Es werden nur Daten verarbeitet, die für die Leistungsbewertung und Vereinsverwaltung unbedingt erforderlich sind. Sensible oder nicht relevante persönliche Informationen werden nicht gespeichert oder angefordert.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Vertraulichkeit</h3>
                <p className="text-muted-foreground">
                  Nur autorisierte Vereinsmitglieder (Spieler, Trainer, Administratoren) dürfen auf Leistungsdaten zugreifen oder diese einsehen. Externe Parteien – einschließlich Sponsoren, externe Vereine oder die Öffentlichkeit – erhalten keinen Zugang.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Kein Verkauf oder Kommerzialisierung von Daten</h3>
                <p className="text-muted-foreground">
                  Unter keinen Umständen werden Spielerdaten an Dritte weitergegeben, verkauft oder für kommerzielle Nutzung zur Verfügung gestellt.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Ihre Rechte</h3>
                <p className="text-muted-foreground">
                  Jeder Spieler kann seine gespeicherten Leistungsdaten einsehen und gemäß der Vereinsrichtlinien Korrekturen oder Löschungen beantragen. Sie können jederzeit über diese Anwendung auf Ihre Daten zugreifen.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Rechtliche Konformität</h3>
                <p className="text-muted-foreground">
                  Der Verein hält sich an die in seiner Jurisdiktion geltenden Datenschutzgesetze (z. B. DSGVO in der EU, nationale Datenschutzbestimmungen).
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Transparente Datennutzung</h3>
                <p className="text-muted-foreground">
                  Klare Informationen über Datennutzung, Speicherung und Zugriffsrichtlinien sind für alle Benutzer direkt in dieser App verfügbar. Sie können diese Bedingungen jederzeit über das App-Menü einsehen.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">Fragen oder Bedenken</h3>
                <p className="text-muted-foreground">
                  Wenn Sie Fragen zu unseren Datenschutzpraktiken oder unserer Datenschutzrichtlinie haben, wenden Sie sich bitte an Ihren Vereinsadministrator.
                </p>
              </section>
            </div>
          )}
        </ScrollArea>

        <AlertDialogFooter>
          {canCancel && (
            <AlertDialogCancel>
              {language === "en" ? "Cancel" : "Abbrechen"}
            </AlertDialogCancel>
          )}
          <AlertDialogAction onClick={handleAccept} disabled={accepting}>
            {accepting 
              ? (language === "en" ? "Accepting..." : "Wird akzeptiert...") 
              : (language === "en" ? "I Accept" : "Ich akzeptiere")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}