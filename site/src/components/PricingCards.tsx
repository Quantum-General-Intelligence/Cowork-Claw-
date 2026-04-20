import { Check } from 'lucide-react'

const APP_URL = 'https://app.cowork-claw.ai'

const PLANS = [
  {
    id: 'hobby',
    name: 'Hobby',
    price: 19,
    interval: '/month',
    description: 'For founders getting started with AI cowork',
    features: [
      '5 tasks per day',
      'BYO Anthropic key',
      '30 min max per task',
      '1 concurrent task',
      'All 10 cowork templates',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    interval: '/month',
    description: 'For founders shipping daily with their AI team',
    features: [
      '50 tasks per day',
      'BYO Anthropic key',
      '2 hour max per task',
      '2 concurrent tasks',
      'All 10 cowork templates',
      'Priority queue',
    ],
    cta: 'Get Pro',
    highlighted: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    price: 129,
    interval: '/month',
    description: 'For teams that cowork together',
    features: [
      '100 tasks per day',
      'BYO Anthropic key',
      '3 hour max per task',
      '3 concurrent tasks',
      '3 team seats',
      'Shared task feed',
      'Team templates',
    ],
    cta: 'Get Studio',
    highlighted: false,
  },
  {
    id: 'whitelabel',
    name: 'White-Label',
    price: 399,
    interval: '/month',
    description: 'Your brand, your AI team platform',
    features: [
      'Unlimited seats',
      'Custom branding & domain',
      '5 concurrent tasks',
      'All templates',
      'Priority support',
    ],
    cta: 'Contact Us',
    highlighted: false,
  },
]

export default function PricingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`relative flex flex-col rounded-xl border bg-card text-card-foreground ${
            plan.highlighted ? 'border-primary shadow-lg shadow-primary/10 scale-[1.02]' : 'border-border'
          }`}
        >
          {plan.highlighted && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
              Most Popular
            </div>
          )}
          <div className="p-6 pb-4">
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
            <div className="mt-4">
              <span className="text-3xl font-bold">${plan.price}</span>
              <span className="text-sm text-muted-foreground ml-1">{plan.interval}</span>
            </div>
            {'minSeats' in plan && typeof plan.minSeats === 'number' && plan.minSeats > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                Starts at ${plan.price * plan.minSeats}/month for {plan.minSeats} users
              </p>
            )}
          </div>
          <div className="px-6 pb-6 flex-1 flex flex-col">
            <ul className="space-y-2.5 flex-1 mb-6">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a
              href={`${APP_URL}/auth?next=${encodeURIComponent(`/subscribe?plan=${plan.id}`)}`}
              className={`w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${
                plan.highlighted
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border border-border bg-background text-foreground'
              }`}
            >
              {plan.cta}
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
