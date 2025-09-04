"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface CustomerEventData {
  customer: string
  date: string
  occasion_type: string
  other_occasion: string
  occasion_name: string
}

export function CustomerForm() {
  const [formData, setFormData] = useState<CustomerEventData>({
    customer: "",
    date: "",
    occasion_type: "",
    other_occasion: "",
    occasion_name: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleInputChange = (field: keyof CustomerEventData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
          customer: "",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Customer Event</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer GID *</Label>
            <Input
              id="customer"
              type="text"
              value={formData.customer}
              onChange={(e) => handleInputChange("customer", e.target.value)}
              required
              placeholder="gid://shopify/Customer/123456789"
            />
            <p className="text-sm text-muted-foreground">
              Enter the Shopify customer GID (e.g., gid://shopify/Customer/123456789)
            </p>
          </div>

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
