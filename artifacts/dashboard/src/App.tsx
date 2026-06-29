import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Bookings from "@/pages/bookings";
import FacebookBookings from "@/pages/facebook-bookings";
import InstagramBookings from "@/pages/instagram-bookings";
import Settings from "@/pages/settings";

import FacebookConnect from "@/pages/facebook-connect";
import NotFound from "@/pages/not-found";
import Usage from "@/pages/usage";
import Storefront from "@/pages/storefront";
import AdminLogin from "@/pages/admin-login";
import StorefrontChats from "@/pages/storefront-chats";
import Themes from "@/pages/themes";
import Reports from "@/pages/reports";
import Privacy from "@/pages/privacy";
import Suggestions from "@/pages/suggestions";
import Visitors from "@/pages/visitors";
import BotFlow from "@/pages/bot-flow";
import BotSettings from "@/pages/bot-settings";
import InstagramBot from "@/pages/instagram-bot";
import InteractiveMenu from "@/pages/interactive-menu";
import BotGeneralQA from "@/pages/bot-general-qa";
import BotTraining from "@/pages/bot-training";
import Receipt from "@/pages/receipt";

const queryClient = new QueryClient();

function isAdminAuthenticated() {
  return localStorage.getItem("beqolky_authenticated") === "true";
}

function ProtectedPage({ component: Component }: { component: React.ComponentType }) {
  if (!isAdminAuthenticated()) return <Redirect to="/beqolky/login" />;
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public storefront — no sidebar */}
      <Route path="/" component={Storefront} />
      <Route path="/privacy" component={Privacy} />

      {/* Admin login — no sidebar */}
      <Route path="/beqolky/login" component={AdminLogin} />

      {/* Protected admin pages */}
      <Route path="/beqolky" component={() => <ProtectedPage component={Dashboard} />} />
      <Route path="/beqolky/inventory" component={() => <ProtectedPage component={Inventory} />} />
      <Route path="/beqolky/bookings" component={() => <ProtectedPage component={Bookings} />} />
      <Route path="/beqolky/facebook-bookings" component={() => <ProtectedPage component={FacebookBookings} />} />
      <Route path="/beqolky/instagram-bookings" component={() => <ProtectedPage component={InstagramBookings} />} />
      <Route path="/beqolky/settings" component={() => <ProtectedPage component={Settings} />} />
      <Route path="/beqolky/facebook-connect" component={() => <ProtectedPage component={FacebookConnect} />} />
      <Route path="/beqolky/usage" component={() => <ProtectedPage component={Usage} />} />
      <Route path="/beqolky/storefront-chats" component={() => <ProtectedPage component={StorefrontChats} />} />
      <Route path="/beqolky/themes" component={() => <ProtectedPage component={Themes} />} />
      <Route path="/beqolky/reports" component={() => <ProtectedPage component={Reports} />} />
      <Route path="/beqolky/suggestions" component={() => <ProtectedPage component={Suggestions} />} />
      <Route path="/beqolky/visitors" component={() => <ProtectedPage component={Visitors} />} />
      <Route path="/beqolky/bot-flow" component={() => <ProtectedPage component={BotFlow} />} />
      <Route path="/beqolky/bot-settings" component={() => <ProtectedPage component={BotSettings} />} />
      <Route path="/beqolky/instagram-bot" component={() => <ProtectedPage component={InstagramBot} />} />
      <Route path="/beqolky/interactive-menu" component={() => <ProtectedPage component={InteractiveMenu} />} />
      <Route path="/beqolky/bot-general-qa" component={() => <ProtectedPage component={BotGeneralQA} />} />
      <Route path="/beqolky/bot-training" component={() => <ProtectedPage component={BotTraining} />} />

      {/* Public receipt page — no auth */}
      <Route path="/receipt/:token" component={Receipt} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
