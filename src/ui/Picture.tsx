/**
 * Pictures on cards: showing one, marking a region of one, and choosing an
 * image file from the device.
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import type {CardImage} from '../core/model';
import {
  IMAGE_ROOTS,
  displayPath,
  ensureReadPermission,
  listImageDir,
} from '../sdk/files';
import {measureImage} from '../sdk/pictureCapture';
import {imageUri, imagesDir, newImageName} from '../storage/libraryStore';
import {Button, Divider, PAD, Row, Screen, Spacer, T, useTheme} from './kit';

type Crop = NonNullable<CardImage['crop']>;

export function cropOf(img: CardImage): Crop {
  return img.crop ?? {x: 0, y: 0, width: img.width, height: img.height};
}

/** The scale that fits a region of w×h inside maxW×maxH, never enlarging past 2×. */
export function fitScale(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(maxW / w, maxH / h, 2);
}

/**
 * Shows a card's picture, cropped to its region. The crop is done by drawing
 * the whole image, offset and clipped by its box, which needs no native code.
 */
export function CardPicture({
  img,
  maxWidth,
  maxHeight,
}: {
  img: CardImage;
  maxWidth: number;
  maxHeight: number;
}) {
  const t = useTheme();
  const c = cropOf(img);
  const s = fitScale(c.width, c.height, maxWidth, maxHeight);
  const boxW = Math.max(1, Math.round(c.width * s));
  const boxH = Math.max(1, Math.round(c.height * s));
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Picture"
      style={{
        width: boxW,
        height: boxH,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: t.line,
      }}>
      <Image
        source={{uri: imageUri(img.file)}}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          left: -c.x * s,
          top: -c.y * s,
          width: img.width * s,
          height: img.height * s,
        }}
      />
    </View>
  );
}

/**
 * Mark a region of a picture with two taps: one corner, then the opposite
 * corner. Two taps rather than dragging, because on e-ink every frame of a
 * drag is a screen refresh and a dragged box lags the pen.
 */
export function CropScreen({
  img,
  title = 'Mark the area',
  onDone,
  onCancel,
}: {
  img: CardImage;
  title?: string;
  onDone: (img: CardImage) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const [area, setArea] = useState({w: 0, h: 0});
  const [a, setA] = useState<{x: number; y: number} | null>(null);
  const [b, setB] = useState<{x: number; y: number} | null>(null);
  const picRef = useRef<View>(null);

  const s = fitScale(img.width, img.height, area.w, area.h);
  const shownW = img.width * s;
  const shownH = img.height * s;

  const tap = (lx: number, ly: number) => {
    if (s <= 0) return;
    const p = {
      x: Math.min(img.width, Math.max(0, lx / s)),
      y: Math.min(img.height, Math.max(0, ly / s)),
    };
    if (!a || b) {
      setA(p);
      setB(null);
    } else {
      setB(p);
    }
  };

  const crop: Crop | null =
    a && b
      ? {
          x: Math.round(Math.min(a.x, b.x)),
          y: Math.round(Math.min(a.y, b.y)),
          width: Math.round(Math.abs(a.x - b.x)),
          height: Math.round(Math.abs(a.y - b.y)),
        }
      : null;
  const usable = !!crop && crop.width >= 8 && crop.height >= 8;

  const hint = !a
    ? 'Tap one corner of the area you want.'
    : !b
    ? 'Now tap the opposite corner.'
    : usable
    ? 'Looks right? Use this area, or tap again to start over.'
    : 'That area is too small. Tap again to start over.';

  return (
    <Screen title={title} onBack={onCancel} backLabel="✕">
      <View style={{paddingHorizontal: PAD, paddingVertical: 10}}>
        <T size={16}>{hint}</T>
      </View>
      <View
        testID="crop-area"
        style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}
        onLayout={(e: LayoutChangeEvent) =>
          setArea({
            w: e.nativeEvent.layout.width - 16,
            h: e.nativeEvent.layout.height - 16,
          })
        }>
        {area.w > 0 ? (
          <Pressable
            accessibilityLabel="Picture to mark"
            ref={picRef}
            onPress={e => {
              const {locationX, locationY, pageX, pageY} = e.nativeEvent;
              if (Number.isFinite(locationX) && Number.isFinite(locationY)) {
                tap(locationX, locationY);
              } else if (picRef.current) {
                // Not every renderer reports location within the view; work it
                // out from the page position instead.
                picRef.current.measure((_x, _y, _w, _h, left, top) =>
                  tap(pageX - left, pageY - top),
                );
              }
            }}
            style={{
              width: shownW,
              height: shownH,
              borderWidth: 1,
              borderColor: t.line,
            }}>
            <View pointerEvents="none">
              <Image
                source={{uri: imageUri(img.file)}}
                resizeMode="stretch"
                style={{width: shownW, height: shownH}}
              />
            </View>
            {a ? <Dot x={a.x * s} y={a.y * s} /> : null}
            {crop ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: crop.x * s,
                  top: crop.y * s,
                  width: crop.width * s,
                  height: crop.height * s,
                  borderWidth: 3,
                  borderColor: t.fg,
                }}
              />
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <View
        style={{padding: PAD, paddingTop: 8, flexDirection: 'row', gap: 10}}>
        <Button
          label="Use whole picture"
          compact
          style={{flex: 1}}
          onPress={() => onDone({...img, crop: undefined})}
        />
        <Button
          label="Use this area"
          compact
          primary
          disabled={!usable}
          style={{flex: 1}}
          onPress={() => crop && onDone({...img, crop})}
        />
      </View>
    </Screen>
  );
}

function Dot({x, y}: {x: number; y: number}) {
  const t = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 9,
        top: y - 9,
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 3,
        borderColor: t.bg,
        backgroundColor: t.fg,
      }}
    />
  );
}

/**
 * Choose an image file on the device. The chosen file is copied into the
 * plugin's own images folder, so the card keeps its picture even if the
 * original is moved or deleted.
 */
export function ImageFilePicker({
  onPicked,
  onClose,
}: {
  onPicked: (img: CardImage) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [listing, setListing] = useState<{
    folders: {name: string; path: string}[];
    images: {name: string; path: string}[];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setListing(null);
    setMessage(null);
    if (path === null) return;
    (async () => {
      if (!(await ensureReadPermission())) {
        if (alive)
          setMessage(
            'Cards needs permission to read files. Go back, try again, and choose Allow.',
          );
        return;
      }
      try {
        const l = await listImageDir(path);
        if (alive) setListing(l);
      } catch (e) {
        if (alive) setMessage("Couldn't open this folder.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  const pick = async (src: string) => {
    setBusy(true);
    try {
      const ext = src.slice(src.lastIndexOf('.') + 1).toLowerCase() || 'png';
      const name = newImageName('pick', ext);
      await RNFS.copyFile(src, `${await imagesDir()}/${name}`);
      const size = await measureImage(`${await imagesDir()}/${name}`);
      if (!size) {
        setMessage("That file couldn't be read as a picture.");
        return;
      }
      onPicked({file: name, ...size});
    } catch (e) {
      setMessage("That picture couldn't be copied.");
    } finally {
      setBusy(false);
    }
  };

  const parent =
    path && !IMAGE_ROOTS.includes(path)
      ? path.slice(0, path.lastIndexOf('/'))
      : null;
  return (
    <Screen
      title={path ? path.slice(path.lastIndexOf('/') + 1) : 'Choose a picture'}
      subtitle={
        path
          ? displayPath(path)
          : 'Screenshots you take on the Supernote are in SCREENSHOT'
      }
      onBack={path === null ? onClose : () => setPath(parent)}
      backLabel={path === null ? '✕' : '←'}>
      <ScrollView contentContainerStyle={{paddingBottom: 24}}>
        {path === null
          ? IMAGE_ROOTS.map((p, i) => (
              <View key={p}>
                {i > 0 ? <Divider inset={PAD} /> : null}
                <Row
                  lead="▸"
                  title={displayPath(p)}
                  bold
                  onPress={() => setPath(p)}
                  right={<T size={20}>›</T>}
                />
              </View>
            ))
          : null}
        {listing?.folders.map(f => (
          <View key={f.path}>
            <Row
              lead="▸"
              title={f.name}
              bold
              onPress={() => setPath(f.path)}
              right={<T size={20}>›</T>}
            />
            <Divider inset={PAD} />
          </View>
        ))}
        {listing?.images.map(f => (
          <View key={f.path}>
            <Row
              lead="◻"
              title={f.name}
              onPress={busy ? undefined : () => pick(f.path)}
            />
            <Divider inset={PAD} />
          </View>
        ))}
        {listing &&
        listing.folders.length === 0 &&
        listing.images.length === 0 ? (
          <View style={{padding: PAD}}>
            <T size={16} muted>
              No pictures (.png, .jpg) or folders here.
            </T>
          </View>
        ) : null}
        {message ? (
          <View style={{padding: PAD}}>
            <T size={16}>{message}</T>
          </View>
        ) : null}
        <Spacer h={10} />
      </ScrollView>
    </Screen>
  );
}
