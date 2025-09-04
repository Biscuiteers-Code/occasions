"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, User } from "lucide-react"

interface CustomerEventData {
  customer: string
  date: string
  occasion_type: string
  other_occasion: string
  occasion_name: string
}

interface ShopifyCustomer {
  id: string
  first_name: string
  last_name: string
  email: string
}

export function ShopifyCustomerForm() {
  const [formData, setFormData] = useState<CustomerEventData>({
    customer: "",
    date: "",
    occasion_type: "",
    other_occasion: "",
    occasion_name: "",
  })
  const [customer, setCustomer] = useState<ShopifyCustomer | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Check if we're in a Shopify environment and get customer data
    if (typeof window !== "undefined" && (window as any).Shopify?.customer) {
      const shopifyCustomer = (window as any).Shopify.customer
      setCustomer(shopifyCustomer)
      setFormData((prev) => ({
        ...prev,
        customer: `gid://shopify/Customer/${shopifyCustomer.id}`,
      }))
    }
  }, [])

  const handleInputChange = (field: keyof CustomerEventData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!customer) {
      toast({
        title: "Authentication Required",
        description: "Please log in to create a customer event.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/create-metaobject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "Success!",
          description: "Your customer event has been created successfully.",
        })
        setFormData({
          customer: formData.customer, // Keep the customer GID
          date: "",
          occasion_type: "",
          other_occasion: "",
          occasion_name: "",
        })
      } else {
        throw new Error(result.error || "Failed to submit")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create customer event",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!customer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Login Required
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground mb-4">Please log in to your account to create a customer event.</p>
          <Button asChild>
            <a href="/account/login">Log In</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Customer Event</CardTitle>
        <p className="text-sm text-muted-foreground">
          Logged in as: {customer.first_name} {customer.last_name}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input type="hidden" value={formData.customer} />

          <div className="space-y-2">
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => handleInputChange("date", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="occasion_type">Occasion Type *</Label>
            <Select value={formData.occasion_type} onValueChange={(value) => handleInputChange("occasion_type", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select occasion type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Dad's Birthday">Dad's Birthday</SelectItem>
                <SelectItem value="Mum's Birthday">Mum's Birthday</SelectItem>
                <SelectItem value="Family Birthday">Family Birthday</SelectItem>
                <SelectItem value="Friend's Birthday">Friend's Birthday</SelectItem>
                <SelectItem value="Anniversary">Anniversary</SelectItem>
                <SelectItem value="Mother's Day">Mother's Day</SelectItem>
                <SelectItem value="Father's Day">Father's Day</SelectItem>
                <SelectItem value="Easter">Easter</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.occasion_type === "Other" && (
            <div className="space-y-2">
              <Label htmlFor="other_occasion">Other Occasion</Label>
              <Input
                id="other_occasion"
                type="text"
                value={formData.other_occasion}
                onChange={(e) => handleInputChange("other_occasion", e.target.value)}
                placeholder="Specify the occasion"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="occasion_name">Occasion Name *</Label>
            <Input
              id="occasion_name"
              type="text"
              value={formData.occasion_name}
              onChange={(e) => handleInputChange("occasion_name", e.target.value)}
              required
              placeholder="Enter occasion name"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Event...
              </>
            ) : (
              "Create Customer Event"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
