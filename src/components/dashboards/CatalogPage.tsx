/**
 * @file CatalogPage.tsx
 * @description Browse and search the metadata catalog through arbora (OVERSTORY-DASH-R016):
 * `catalog.assets.browse` for the asset list with per-kind counts, `catalog.assets.search`
 * for ranked text search and `catalog.assets.get` for one asset's owners, glossary terms,
 * lineage, ratings and comments. Each unserved, denied or empty answer is labelled.
 */
import { useState, type SyntheticEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusMessage } from '@/components/ui/status-message'
import { ServedState } from '@/components/served/ServedState'
import { callServed, type ServedReply } from '@/lib/arbora-api/served'

const assetSchema = z
  .object({
    asset_id: z.string(),
    kind: z.string(),
    name: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
  })
  .strict()
const browseSchema = z
  .object({
    facets: z.array(z.object({ kind: z.string(), count: z.number() }).strict()),
    items: z.array(assetSchema),
    next_cursor: z.string().nullable().optional(),
  })
  .strict()
const searchSchema = z.object({ items: z.array(assetSchema), next_cursor: z.string().nullable().optional() }).strict()
const detailSchema = z
  .object({
    asset_id: z.string(),
    kind: z.string(),
    name: z.string().nullable().optional(),
    owners: z.array(z.string()),
    terms: z.array(z.string()),
    lineage: z.object({ upstream: z.array(z.string()), downstream: z.array(z.string()) }).strict(),
    ratings: z.object({ count: z.number(), mean: z.number().nullable().optional() }).strict(),
    comments: z.array(
      z
        .object({
          id: z.string(),
          author: z.string().nullable().optional(),
          at: z.string().nullable().optional(),
          text: z.string(),
        })
        .strict(),
    ),
  })
  .strict()

interface AssetPage {
  items: z.infer<typeof assetSchema>[]
  facets: { kind: string; count: number }[]
}

function AssetList({ search, kind, onOpen }: { search: string; kind: string; onOpen: (id: string) => void }) {
  const query = useQuery({
    queryKey: ['catalog-assets', search, kind],
    queryFn: async ({ signal }): Promise<ServedReply<AssetPage>> => {
      if (!search) {
        const browsed = await callServed('catalog.assets.browse', { kind: kind || null }, browseSchema, { signal })
        return browsed.kind === 'ready' ? { kind: 'ready', result: browsed.result } : browsed
      }
      const found = await callServed(
        'catalog.assets.search',
        { text: search, kinds: kind ? [kind] : [] },
        searchSchema,
        {
          signal,
        },
      )
      return found.kind === 'ready' ? { kind: 'ready', result: { items: found.result.items, facets: [] } } : found
    },
    retry: false,
  })
  if (query.isLoading) return <StatusMessage status="loading" />
  if (query.isError) return <StatusMessage status="error" detail="The catalog could not be reached." />
  const reply = query.data
  if (!reply) return null
  if (reply.kind !== 'ready') return <ServedState reply={reply} what="The catalog" />
  const { items, facets } = reply.result
  return (
    <div className="space-y-3">
      {facets.length > 0 && (
        <p className="text-xs text-muted-foreground" aria-label="Assets per kind">
          {facets.map((facet) => `${facet.kind}: ${String(facet.count)}`).join(' · ')}
        </p>
      )}
      {items.length === 0 ? (
        <StatusMessage status="empty" label="No catalog assets match." />
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.asset_id}>
              <button
                type="button"
                className="w-full rounded border border-border/30 p-2 text-left text-sm hover:bg-muted/30"
                onClick={() => {
                  onOpen(item.asset_id)
                }}
              >
                <span className="font-medium">{item.name ?? item.asset_id}</span>{' '}
                <span className="text-xs text-muted-foreground">
                  {item.kind}
                  {item.owner ? ` · ${item.owner}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NameList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold">{title}</h4>
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="text-xs">
          {values.map((value) => (
            <li key={value} className="font-mono">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AssetDetail({ assetId }: { assetId: string }) {
  const query = useQuery({
    queryKey: ['catalog-asset', assetId],
    queryFn: ({ signal }) => callServed('catalog.assets.get', { asset_id: assetId }, detailSchema, { signal }),
    retry: false,
  })
  if (query.isLoading) return <StatusMessage status="loading" />
  if (query.isError) return <StatusMessage status="error" detail="The asset could not be read." />
  const reply = query.data
  if (!reply) return null
  if (reply.kind !== 'ready') return <ServedState reply={reply} what="This asset" />
  const asset = reply.result
  return (
    <section
      aria-label={`Asset ${asset.name ?? asset.asset_id}`}
      className="space-y-3 rounded border border-border/30 p-3"
    >
      <h3 className="font-medium">{asset.name ?? asset.asset_id}</h3>
      <p className="text-xs text-muted-foreground">{asset.kind}</p>
      <NameList title="Owners" values={asset.owners} />
      <NameList title="Glossary terms" values={asset.terms} />
      <NameList title="Upstream lineage" values={asset.lineage.upstream} />
      <NameList title="Downstream lineage" values={asset.lineage.downstream} />
      <p className="text-xs">
        Ratings:{' '}
        {asset.ratings.count === 0 || asset.ratings.mean == null
          ? 'none yet'
          : `${asset.ratings.mean.toFixed(1)} from ${String(asset.ratings.count)}`}
      </p>
      <div>
        <h4 className="text-xs font-semibold">Comments</h4>
        {asset.comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {asset.comments.map((comment) => (
              <li key={comment.id}>
                <span className="font-medium">{comment.author ?? 'unknown'}</span>: {comment.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function CatalogPage() {
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const kinds = useQuery({
    queryKey: ['catalog-kinds'],
    queryFn: ({ signal }) => callServed('catalog.assets.browse', { kind: null }, browseSchema, { signal }),
    retry: false,
  })
  const facets = kinds.data?.kind === 'ready' ? kinds.data.result.facets : []
  function submit(event: SyntheticEvent) {
    event.preventDefault()
    setSearch(draft.trim())
    setOpen(null)
  }
  return (
    <div className="space-y-4 p-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-xs">
          Search the catalog
          <Input
            value={draft}
            maxLength={1000}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            className="h-9 w-72"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Asset kind
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value)
              setOpen(null)
            }}
          >
            <option value="">All kinds</option>
            {facets.map((facet) => (
              <option key={facet.kind} value={facet.kind}>
                {facet.kind}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        <AssetList search={search} kind={kind} onOpen={setOpen} />
        {open ? <AssetDetail assetId={open} /> : <StatusMessage status="empty" label="Select an asset." />}
      </div>
    </div>
  )
}
