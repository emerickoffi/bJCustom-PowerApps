/** Discount display rules shared by server and client code. */

export type CompanyDiscount = {
  couponId: string
  /** e.g. "20% off for 3 months" */
  label: string
  /** When the discount stops, for coupons that last a set number of months. */
  endsAt: string | null
  /** True when saved for a company that has not subscribed yet; applied at Checkout. */
  pending: boolean
}

export type CouponOption = { id: string; label: string }

type CouponLike = {
  name?: string | null
  percent_off: number | null
  amount_off: number | null
  duration: string
  duration_in_months: number | null
}

export function describeCoupon(c: CouponLike): string {
  if (c.name) return c.name
  const off =
    c.percent_off !== null
      ? `${c.percent_off}% off`
      : c.amount_off !== null
        ? `$${(c.amount_off / 100).toLocaleString('en-US', { minimumFractionDigits: c.amount_off % 100 ? 2 : 0 })} off`
        : 'Discount'
  if (c.duration === 'forever') return `${off} forever`
  if (c.duration === 'once') return `${off} the first payment`
  const m = c.duration_in_months ?? 0
  return `${off} for ${m} month${m === 1 ? '' : 's'}`
}
