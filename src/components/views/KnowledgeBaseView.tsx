import { useState, useEffect } from 'react'
import { z } from 'zod'
import { Book, Search, FileText, Brain, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fetchValidated, looseArray } from '@/lib/api-validation'
import { StatusMessage } from '@/components/ui/status-message'

interface KnowledgeBase {
  id: string
  name: string
  article_count: number
  topics: string[]
  health_status: 'healthy' | 'warning' | 'error'
  last_updated: string
}

interface Article {
  id: string
  title: string
  content: string
  kb_id: string
  concepts: string[]
  created_at: string
}

// D-WUI-13: `/api/enhanced/kb/list` returning anything other than an array
// (null, `{}`, an error envelope) used to crash `filteredKBs =
// knowledgeBases.filter(...)` below. Validate at the fetch boundary instead
// of trusting a `res.json() as T` cast — see src/lib/api-validation.ts.
const knowledgeBaseSchema: z.ZodType<KnowledgeBase> = z.object({
  id: z.string(),
  name: z.string(),
  article_count: z.number(),
  topics: z.array(z.string()),
  health_status: z.enum(['healthy', 'warning', 'error']),
  last_updated: z.string(),
})

const articleSchema: z.ZodType<Article> = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  kb_id: z.string(),
  concepts: z.array(z.string()),
  created_at: z.string(),
})

/** Knowledge-base + article state, kept out of the view's own
 * render body. */
function useKnowledgeBaseData() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('browse')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  const fetchKnowledgeBases = async () => {
    try {
      setLoading(true)
      const data = await fetchValidated('/api/enhanced/kb/list', looseArray(knowledgeBaseSchema))
      setKnowledgeBases(data)
      if (data.length > 0 && !selectedKB) {
        setSelectedKB(data[0])
      }
    } catch {
      toast.error('Failed to load knowledge bases')
    } finally {
      setLoading(false)
    }
  }

  const fetchArticles = async (kbId: string) => {
    try {
      const data = await fetchValidated(`/api/enhanced/kb/search?query=&kb_id=${kbId}`, looseArray(articleSchema))
      setArticles(data)
    } catch {
      toast.error('Failed to load articles')
    }
  }

  useEffect(() => {
    void fetchKnowledgeBases()
  }, [])

  useEffect(() => {
    if (selectedKB) {
      void fetchArticles(selectedKB.id)
    }
  }, [selectedKB])

  return {
    knowledgeBases,
    selectedKB,
    setSelectedKB,
    articles,
    loading,
    activeTab,
    setActiveTab,
    selectedArticle,
    setSelectedArticle,
    fetchKnowledgeBases,
  }
}

function kbHealthClasses(status: KnowledgeBase['health_status']): string {
  if (status === 'healthy') return 'bg-green-500/10 text-green-500'
  if (status === 'warning') return 'bg-yellow-500/10 text-yellow-500'
  return 'bg-red-500/10 text-red-500'
}

function KBCard({
  kb,
  selected,
  onSelect,
}: {
  kb: KnowledgeBase
  selected: boolean
  onSelect: (kb: KnowledgeBase) => void
}) {
  return (
    <Card
      className={cn('cursor-pointer transition-all hover:shadow-md', selected ? 'ring-2 ring-primary' : '')}
      onClick={() => {
        onSelect(kb)
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('p-2 rounded-lg', kbHealthClasses(kb.health_status))}>
              {kb.health_status === 'healthy' ? (
                <CheckCircle className="size-4" />
              ) : (
                <AlertCircle className="size-4" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">{kb.name}</CardTitle>
              <CardDescription>{kb.id}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Articles</span>
            <span className="font-medium">{kb.article_count}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {kb.topics.slice(0, 3).map((topic) => (
              <Badge key={topic} variant="secondary" className="text-xs">
                {topic}
              </Badge>
            ))}
            {kb.topics.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{kb.topics.length - 3}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Last updated: {new Date(kb.last_updated).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function BrowseTab({
  loading,
  filteredKBs,
  selectedKB,
  onSelect,
  searchQuery,
  onSearchChange,
}: {
  loading: boolean
  filteredKBs: KnowledgeBase[]
  selectedKB: KnowledgeBase | null
  onSelect: (kb: KnowledgeBase) => void
  searchQuery: string
  onSearchChange: (v: string) => void
}) {
  return (
    <TabsContent value="browse" className="space-y-4">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search knowledge bases..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value)
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 flex justify-center">
            <StatusMessage status="loading" />
          </div>
        ) : filteredKBs.length === 0 ? (
          <div className="col-span-3 flex justify-center">
            <StatusMessage status="empty" label="No knowledge bases found" />
          </div>
        ) : (
          filteredKBs.map((kb) => (
            <KBCard key={kb.id} kb={kb} selected={selectedKB?.id === kb.id} onSelect={onSelect} />
          ))
        )}
      </div>
    </TabsContent>
  )
}

function ArticleCard({ article, onSelect }: { article: Article; onSelect: (article: Article) => void }) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all"
      onClick={() => {
        onSelect(article)
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">{article.title}</CardTitle>
              <CardDescription className="text-xs">
                {new Date(article.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {article.concepts.length} concepts
          </Badge>
        </div>
      </CardHeader>
    </Card>
  )
}

function ArticlesTab({
  selectedKB,
  loading,
  filteredArticles,
  onSelectArticle,
  searchQuery,
  onSearchChange,
}: {
  selectedKB: KnowledgeBase | null
  loading: boolean
  filteredArticles: Article[]
  onSelectArticle: (article: Article) => void
  searchQuery: string
  onSearchChange: (v: string) => void
}) {
  if (!selectedKB) {
    return (
      <TabsContent value="articles" className="space-y-4">
        <div className="text-center text-muted-foreground py-20">
          <Book className="size-16 mx-auto mb-4" />
          <p>Select a knowledge base to view articles</p>
        </div>
      </TabsContent>
    )
  }
  return (
    <TabsContent value="articles" className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value)
            }}
          />
        </div>
        <Badge variant="outline">{selectedKB.name}</Badge>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading articles...</p>
        ) : filteredArticles.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No articles found</p>
        ) : (
          filteredArticles.map((article) => (
            <ArticleCard key={article.id} article={article} onSelect={onSelectArticle} />
          ))
        )}
      </div>
    </TabsContent>
  )
}

function ConceptsTab({ selectedKB, articles }: { selectedKB: KnowledgeBase | null; articles: Article[] }) {
  if (!selectedKB) {
    return (
      <TabsContent value="concepts" className="space-y-4">
        <div className="text-center text-muted-foreground py-20">
          <Brain className="size-16 mx-auto mb-4" />
          <p>Select a knowledge base to view concepts</p>
        </div>
      </TabsContent>
    )
  }
  return (
    <TabsContent value="concepts" className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from(new Set(articles.flatMap((a) => a.concepts))).map((concept) => (
          <Card key={concept} className="p-4 hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              <span className="font-medium text-sm">{concept}</span>
            </div>
          </Card>
        ))}
      </div>
    </TabsContent>
  )
}

function ArticleDetailDialog({ article, onClose }: { article: Article | null; onClose: () => void }) {
  if (!article) return null
  return (
    <Dialog open={!!article} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{article.title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-full max-h-[60vh]">
          <div className="prose prose-sm dark:prose-invert p-4">{article.content}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default function KnowledgeBaseView() {
  const kb = useKnowledgeBaseData()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredKBs = kb.knowledgeBases.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.topics.some((topic) => topic.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const filteredArticles = kb.articles.filter(
    (article) =>
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="space-y-6 h-[calc(100vh-12rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Book className="size-6" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground text-sm">Manage knowledge bases and articles</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void kb.fetchKnowledgeBases()
            }}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs value={kb.activeTab} onValueChange={kb.setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="concepts">Concepts</TabsTrigger>
        </TabsList>

        <BrowseTab
          loading={kb.loading}
          filteredKBs={filteredKBs}
          selectedKB={kb.selectedKB}
          onSelect={kb.setSelectedKB}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <ArticlesTab
          selectedKB={kb.selectedKB}
          loading={kb.loading}
          filteredArticles={filteredArticles}
          onSelectArticle={kb.setSelectedArticle}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <ConceptsTab selectedKB={kb.selectedKB} articles={kb.articles} />
      </Tabs>

      <ArticleDetailDialog
        article={kb.selectedArticle}
        onClose={() => {
          kb.setSelectedArticle(null)
        }}
      />
    </div>
  )
}
