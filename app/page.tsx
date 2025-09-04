import { CustomerForm } from "@/components/customer-form"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Customer Information</h1>
            <p className="text-muted-foreground">Please fill out the form below to submit your information</p>
          </div>
          <CustomerForm />
        </div>
      </div>
    </main>
  )
}
