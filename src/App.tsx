import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import CustomerOrderPage from "./pages/CustomerOrderPage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminPricingPage from "./pages/AdminPricingPage";
import PaymentPage from "./pages/PaymentPage";
import PaymentThankYouPage from "./pages/PaymentThankYouPage";
import PricingWaitingPage from "./pages/PricingWaitingPage";
import AdminQueuePage from "./pages/AdminQueuePage";
import PreparingFilesPage from "./pages/PreparingFilesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/order" element={<CustomerOrderPage />} />
        <Route path="/track" element={<OrderTrackingPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/orders" element={<AdminOrdersPage />} />
        <Route path="/admin/queue" element={<AdminQueuePage />} />
        <Route path="/admin/pricing" element={<AdminPricingPage />} />
        <Route path="/payment/:orderNumber" element={<PaymentPage />} />
        <Route path="/thank-you/:orderNumber" element={<PaymentThankYouPage />} />
        <Route path="/pricing-wait/:orderNumber" element={<PricingWaitingPage />} />
        <Route path="/preparing/:orderNumber" element={<PreparingFilesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function NotFoundPage() {
  return (
    <main className="min-h-screen bg-snow-white p-8 text-snow-ink">
      <section className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 shadow-soft">
        <h1 className="text-3xl font-black text-snow-navy">Page not found</h1>
        <Link to="/" className="mt-6 inline-block rounded-full bg-snow-navy px-5 py-3 text-sm font-bold text-white">
          Back to SnowPrint
        </Link>
      </section>
    </main>
  );
}
