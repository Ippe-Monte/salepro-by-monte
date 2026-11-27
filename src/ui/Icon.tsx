import { Fragment } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Polyline, Rect } from 'react-native-svg';
import { View } from 'react-native';
import { ICON_MARKUP } from './iconData';
import { colors } from './theme';

export type IconName = keyof typeof ICON_MARKUP;

type El = { tag: string; props: Record<string, string>; fill: boolean };

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// The markup strings are our own constants; parse them once into elements (no HTML injection of any kind).
function parse(markup: string): El[] {
  const solid = markup.startsWith('FILL:');
  const src = solid ? markup.slice(5) : markup;
  return [...src.matchAll(/<(path|circle|rect|line|polyline|ellipse)\b([^>]*?)\/?>/g)].map((m) => {
    const props: Record<string, string> = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) props[camel(a[1])] = a[2];
    return { tag: m[1], props, fill: solid || props.fill === 'currentColor' };
  });
}

const cache = new Map<string, El[]>();
function elements(name: string): El[] {
  let e = cache.get(name);
  if (!e) { e = parse(ICON_MARKUP[name] ?? ICON_MARKUP.help); cache.set(name, e); }
  return e;
}

const TAGS = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, ellipse: Ellipse } as const;

/** Bare line icon in one colour (default: the text colour). */
export function Icon({ name, size = 22, color, strokeWidth = 1.9 }: { name: IconName | string; size?: number; color?: string; strokeWidth?: number }) {
  const c = color ?? colors.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {elements(name).map((el, i) => {
        const Tag = TAGS[el.tag as keyof typeof TAGS] as React.ElementType;
        const props = { ...el.props } as Record<string, string>;
        if (el.fill) { props.fill = c; props.stroke = 'none'; }
        return <Fragment key={i}><Tag {...props} /></Fragment>;
      })}
    </Svg>
  );
}

/** Menu chip: pale rounded tile with the icon in brand blue (used for menus and quick actions). */
export function IconChip({ name, size = 44, tone }: { name: IconName | string; size?: number; tone?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.52)} color={tone ?? colors.accent} />
    </View>
  );
}
