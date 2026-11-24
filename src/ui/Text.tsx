import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { useLang } from '@/i18n';
import { translate, type Lang } from '@/i18n/translate';

function map(node: ReactNode, lang: Lang): ReactNode {
  if (typeof node === 'string') return translate(node, lang);
  if (Array.isArray(node)) return Children.map(node, (c) => map(c, lang));
  if (isValidElement(node) && node.type === RNText) return cloneElement(node as never, undefined, map((node.props as { children?: ReactNode }).children, lang));
  return node;
}

/** Drop-in for react-native's Text: Thai strings are shown in English when the language is EN. */
export function Text({ children, ...rest }: TextProps) {
  const lang = useLang();
  return <RNText {...rest}>{map(children, lang)}</RNText>;
}
