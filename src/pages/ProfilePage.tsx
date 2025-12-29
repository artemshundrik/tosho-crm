import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User, Mail, Shield, Save, Loader2, Camera, Lock, Globe } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [initials, setInitials] = useState("");

  useEffect(() => {
    getProfile();
  }, []);

  const getProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email || "");
        const metaName = user.user_metadata?.full_name || "";
        setFullName(metaName);

        const i = (metaName || user.email || "U")
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .substring(0, 2).toUpperCase();
        setInitials(i);

        const { data: roleData } = await supabase.rpc('current_team_role');
        setRole((roleData as string) || "viewer");
      }
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    try {
      setUpdating(true);
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      if (error) throw error;
      
      const i = fullName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
      setInitials(i);

      toast.success("Профіль оновлено!", {
        description: "Твоє нове ім'я збережено в системі.",
      });

      // Невеликий таймаут для візуального комфорту перед оновленням
      setTimeout(() => window.location.reload(), 1000);

    } catch (error: any) {
      toast.error("Помилка оновлення", {
        description: error.message,
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
         <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-8 animate-in fade-in duration-500">
      
      {/* Картка профілю: використовуємо системні змінні для кольорів та радіусів */}
      <div className={cn(
        "bg-card border border-border overflow-hidden",
        "shadow-surface", // Твій кастомний клас тіні з CSS
        "rounded-[24px] md:rounded-[32px]" // Велике заокруглення (як --radius-section)
      )}>
        
        {/* Banner: градієнт на основі Primary кольору (працює і в темній темі) */}
        <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/5 to-background/0 relative">
          <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
        </div>
        
        <div className="px-6 pb-8 md:px-10">
          {/* Avatar Row */}
          <div className="relative -mt-12 mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-6">
              
              {/* Avatar Wrapper */}
              <div className="relative group mx-auto sm:mx-0">
                <Avatar className="h-28 w-28 border-[4px] border-card shadow-lg bg-card text-foreground">
                  <AvatarFallback className="text-3xl font-bold bg-muted text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                
                {/* Edit Photo Button */}
                <button className="absolute bottom-1 right-1 p-2 rounded-full border-[3px] border-card bg-foreground text-background hover:bg-foreground/80 transition-colors shadow-sm">
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="mb-3 space-y-1.5 text-center sm:text-left">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">{fullName || "Користувач"}</h2>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                   {/* Role Badge: Soft style */}
                   <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary uppercase tracking-wider">
                      {role === 'super_admin' ? 'Super Admin' : role}
                   </div>
                   <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Kyiv, UA
                   </span>
                </div>
              </div>
            </div>

            <Button onClick={updateProfile} disabled={updating} className="shadow-sm hidden sm:flex">
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Зберегти зміни
            </Button>
          </div>

          <Separator className="my-8" />

          {/* Form Grid */}
          <div className="grid gap-8 md:grid-cols-[250px_1fr]">
            
            {/* Section Title */}
            <div>
               <h3 className="text-lg font-semibold text-foreground">Особисті дані</h3>
               <p className="text-sm text-muted-foreground mt-1">Інформація, яку бачать інші учасники команди.</p>
            </div>

            {/* Inputs */}
            <div className="space-y-5 max-w-lg">
              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Повне ім'я
                </label>
                <Input 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  // Використовуємо muted фон для інпутів для контрасту
                  className="bg-muted/30 border-input focus:bg-background transition-all h-10 rounded-xl"
                  placeholder="Введи своє ім'я"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Email
                </label>
                <Input 
                  value={email}
                  disabled
                  // Disabled state styling
                  className="bg-muted text-muted-foreground border-transparent h-10 rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground px-1">
                  Змінити email можна лише через звернення до адміністратора.
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-8" />

          {/* Security Section */}
          <div className="grid gap-8 md:grid-cols-[250px_1fr]">
            <div>
               <h3 className="text-lg font-semibold text-foreground">Безпека</h3>
               <p className="text-sm text-muted-foreground mt-1">Оновлення пароля та захист акаунту.</p>
            </div>

            <div className="space-y-5 max-w-lg">
               <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Пароль
                </label>
                <div className="flex gap-3">
                   <div className="relative w-full">
                     <Input 
                        disabled 
                        value="••••••••••••••" 
                        type="password"
                        className="bg-muted/30 border-input h-10 rounded-xl"
                     />
                   </div>
                   <Button variant="outline" className="h-10 rounded-xl border-input hover:bg-muted/50">
                     Змінити
                   </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Mobile Save Button */}
          <div className="mt-8 sm:hidden">
            <Button onClick={updateProfile} disabled={updating} className="w-full h-11 text-base rounded-xl">
              {updating ? "Зберігаю..." : "Зберегти зміни"}
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}