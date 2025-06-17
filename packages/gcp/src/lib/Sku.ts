import axios from 'axios'

interface Sku {
  name: string
  skuId: string
  description: string
  category: {
    serviceDisplayName: string
    resourceFamily: string
    resourceGroup: string
    usageType: string
  }
  serviceRegions: string[]
  pricingInfo: PricingInfo[]
  serviceProviderName?: string
}

interface PricingInfo {
  effectiveTime: string
  pricingExpression: PricingExpression
  aggregationInfo?: AggregationInfo
  summary?: string
}

interface PricingExpression {
  usageUnit: string
  usageUnitDescription: string
  baseUnit?: string
  baseUnitConversionFactor?: number
  displayQuantity?: number
  tieredRates: TierRate[]
}

interface TierRate {
  startUsageAmount: number
  unitPrice: {
    currencyCode: string
    units: string
    nanos: number
  }
  discountPercent?: number
}

interface AggregationInfo {
  aggregationLevel: 'ACCOUNT' | 'PROJECT'
  aggregationInterval: 'DAILY' | 'MONTHLY'
  aggregationCount: number
}

type SkuResponse = {
  skus: Sku[]
  nextPageToken?: string
}

export default class SkuDatabase {
  private readonly skus: Map<string, Sku[]>
  private readonly token: string

  constructor(token: string) {
    this.skus = new Map<string, Sku[]>()
    this.token = token
  }

  public async getSkus(service: string): Promise<Sku[]> {
    if (this.skus.has(service)) {
      return this.skus.get(service)
    }

    this.skus.set(service, [])

    let nextPage = true
    let nextPageToken = ''
    while (nextPage) {
      let url = `https://cloudbilling.googleapis.com/v1/services/${service}/skus?pageSize=100`
      if (nextPageToken) {
        url += `&pageToken=${nextPageToken}`
      }

      try {
        const { data } = await axios.get<SkuResponse>(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        })

        nextPage = data.nextPageToken ? true : false
        nextPageToken = data.nextPageToken

        this.skus.get(service).push(...data.skus)
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.log('error message: ', error.message)
        } else {
          console.log('unexpected error: ', error)
        }
        break
      }
    }

    return this.skus.get(service)
  }

  public async getCandidates(
    service: string,
    originalSku: string,
  ): Promise<Sku[]> {
    const skus = await this.getSkus(service)
    const candidates = []

    for (const sku of skus) {
      if (sku.description.split(' ').slice(0, -1).join(' ') === originalSku) {
        candidates.push(sku)
      }
    }

    return candidates
  }
}
