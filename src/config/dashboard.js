import {
  Activity,
  ArrowLeftRight,
  CircleDollarSign,
  Gem,
  Images,
  Landmark,
  Layers3,
  Network,
  Radio,
  ShieldCheck,
  CalendarDays,
  BadgeCheck,
  Trophy,
  WalletCards,
} from 'lucide-react'
export const navItems = [
  { label: 'Overview', icon: '99_1001.svg' },
  { label: 'Money Flow', icon: '99_1008.svg' },
]

export const metricIcons = {
  rank: Trophy,
  activity: Activity,
  risk: ShieldCheck,
  network: Network,
}

export const portfolioIcons = {
  wallet: WalletCards,
  nft: Images,
  defi: Landmark,
  collection: Gem,
}

export const identityIcons = {
  portfolio: Trophy,
  risk: ShieldCheck,
  age: CalendarDays,
  kyc: BadgeCheck,
}

export const highlightIcons = {
  holding: CircleDollarSign,
  protocol: Layers3,
  chain: Radio,
  transactions: ArrowLeftRight,
}
