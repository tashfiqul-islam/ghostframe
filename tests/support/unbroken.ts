/** Answer text with no space to break at (B1): a word wider than the row must be broken inside it, never cut off. */
export const UNBROKEN = {
  chinese: '这是一个很长的中文句子没有任何空格所以它永远不会被换行这是一个很长的中文句子没有任何空格所以它永远不会被换行。',
  japanese: 'これはスペースのない長い日本語の文章ですので折り返しが必要になりますこれはスペースのない長い日本語の文章ですので折り返しが必要になります。',
  url: 'See https://example.com/a/very/long/path/that/goes/on/and/on/forever/and/ever/and/then/some/more/after/that/index.html?query=yes now',
  path: 'Edit D:/Projects/ghostframe/hooks/transcript/sites/reply/a/very/deeply/nested/folder/structure/that/keeps/going/on/file-name.test.tsx today'
}

/** Text with its whitespace taken out: what must survive a wrap, whatever rows it breaks into. */
export const bare = (s: string): string => s.replace(/\s+/g, '')
