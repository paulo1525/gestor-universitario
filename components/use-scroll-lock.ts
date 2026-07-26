"use client";

import { useEffect } from "react";

type InlineStyles = {
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  htmlScrollBehavior: string;
  bodyLeft: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  bodyPosition: string;
  bodyRight: string;
  bodyTop: string;
  bodyWidth: string;
};

let activeLocks = 0;
let lockedScrollY = 0;
let savedStyles: InlineStyles | null = null;

function lockPageScroll() {
  activeLocks += 1;
  if (activeLocks > 1) return;

  const html = document.documentElement;
  const body = document.body;
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

  lockedScrollY = window.scrollY;
  savedStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
    htmlScrollBehavior: html.style.scrollBehavior,
    bodyLeft: body.style.left,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
    bodyPosition: body.style.position,
    bodyRight: body.style.right,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
  };

  html.classList.add("app-scroll-locked");
  body.classList.add("app-scroll-locked");
  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.left = "0";
  body.style.right = "0";
  body.style.top = `-${lockedScrollY}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
  }
}

function unlockPageScroll() {
  if (activeLocks === 0) return;
  activeLocks -= 1;
  if (activeLocks > 0 || !savedStyles) return;

  const html = document.documentElement;
  const body = document.body;
  const restore = savedStyles;
  savedStyles = null;

  html.classList.remove("app-scroll-locked");
  body.classList.remove("app-scroll-locked");
  html.style.overflow = restore.htmlOverflow;
  html.style.overscrollBehavior = restore.htmlOverscrollBehavior;
  html.style.scrollBehavior = "auto";
  body.style.position = restore.bodyPosition;
  body.style.top = restore.bodyTop;
  body.style.left = restore.bodyLeft;
  body.style.right = restore.bodyRight;
  body.style.width = restore.bodyWidth;
  body.style.overflow = restore.bodyOverflow;
  body.style.overscrollBehavior = restore.bodyOverscrollBehavior;
  body.style.paddingRight = restore.bodyPaddingRight;
  const restoreScroll = () => {
    const viewportHeight = Math.max(0, html.clientHeight || window.innerHeight);
    const documentHeight = Math.max(html.scrollHeight, body.scrollHeight);
    const maxScrollY = Math.max(0, documentHeight - viewportHeight);
    window.scrollTo(0, Math.min(lockedScrollY, maxScrollY));
  };

  restoreScroll();
  window.requestAnimationFrame(() => {
    if (activeLocks > 0) return;
    restoreScroll();
    html.style.scrollBehavior = restore.htmlScrollBehavior;
  });
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockPageScroll();
    return unlockPageScroll;
  }, [active]);
}
