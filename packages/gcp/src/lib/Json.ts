import * as fs from 'fs'
import * as path from 'path'
import { RowMetadata } from '@google-cloud/bigquery'

type GcpEntry = {
  usage_start_time: string
  cost_type: string
  usage: {
    unit: string
    amount: number
  }
  cost: number
  project: {
    id: string
    name: string
  }
  location: {
    region?: string
    location: string
  }
  service: {
    id: string
    description: string
  }
  sku: {
    description: string
  }
  system_labels: {
    key: string
    value: string
  }[]
}

type CompactEntry = {
  timestamp: { value: string }
  accountId: string
  accountName: string
  region: string
  serviceName: string
  usageType: string
  usageUnit: string
  machineType: string | null
  usageAmount: number
  cost: number
}

export class Json {
  private readonly compactEntries: Map<string, CompactEntry>
  private readonly gcpEntries: GcpEntry[]

  constructor(billingFile: string, startDate: Date, endDate: Date) {
    this.compactEntries = new Map<string, CompactEntry>()
    this.gcpEntries = []

    const raw = fs.readFileSync(path.resolve(billingFile), 'utf-8')
    const lines = raw.trim().split('\n')

    for (const line of lines) {
      const entry = JSON.parse(line) as GcpEntry
      entry.usage_start_time = entry.usage_start_time.split(' ')[0]

      if (!this.isValidEntry(entry, startDate, endDate)) {
        continue
      }

      this.gcpEntries.push(entry)

      const machineLabel = entry.system_labels.find(
        (sl) => sl.key === 'compute.googleapis.com/machine_spec',
      )

      const compact: CompactEntry = {
        timestamp: { value: entry.usage_start_time },
        accountId: entry.project.id,
        accountName: entry.project.name,
        region: entry.location.region ?? entry.location.location,
        serviceName: entry.service.description,
        usageType: entry.sku.description,
        usageUnit: entry.usage.unit,
        machineType: machineLabel ? machineLabel.value : null,
        usageAmount: entry.usage.amount,
        cost: entry.cost,
      }

      const key: string = [
        compact.timestamp.value,
        compact.accountId,
        compact.accountName,
        compact.region,
        compact.serviceName,
        compact.usageType,
        compact.usageUnit,
        compact.machineType ?? 'null',
      ].join('|')

      if (!this.compactEntries.has(key)) {
        this.compactEntries.set(key, { ...compact })
      } else {
        const existing = this.compactEntries.get(key)
        existing.usageAmount += compact.usageAmount
        existing.cost += compact.cost
      }
    }
  }

  private isValidEntry(
    entry: GcpEntry,
    startDate: Date,
    endDate: Date,
  ): boolean {
    return (
      entry.cost_type !== 'rounding_error' &&
      this.isValidUsageUnit(entry.usage.unit) &&
      this.dateBetween(entry.usage_start_time, startDate, endDate)
    )
  }

  private isValidUsageUnit(unit: string) {
    return ['byte-seconds', 'seconds', 'bytes', 'requests'].includes(unit)
  }

  private dateBetween(dateStr: string, start: Date, end: Date): boolean {
    const date = new Date(dateStr)
    return date >= start && date <= end
  }

  public getEntries(): GcpEntry[] {
    return this.gcpEntries
  }

  public getUsage(): RowMetadata[] {
    return Array.from(this.compactEntries.values()) as RowMetadata[]
  }
}
