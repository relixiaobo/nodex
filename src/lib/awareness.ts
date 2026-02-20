/**
 * ⑦ Awareness — 实时在线状态协议
 *
 * 纯内存模块，管理多用户实时状态（光标、选区、用户信息）。
 * 仅做 API 层，网络传输（WebSocket / Supabase Realtime）由外层处理。
 *
 * 使用方式：
 * 1. 初始化本地用户：setLocalUser({ id, name, color })
 * 2. 更新光标/选区：setLocalState({ cursor: { nodeId } })
 * 3. 接收远端状态：applyRemoteState(userId, state)
 * 4. 订阅变化：onRemoteStateChange(callback)
 * 5. 序列化传输：serializeLocalState() → 发送给其他 peer
 * 6. 接收传输：deserializeAndApplyState(payload)
 */

// ============================================================
// 类型定义
// ============================================================

export interface UserInfo {
  /** 用户唯一 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 用户标识色（hex，如 '#FF5733'） */
  color: string;
}

export interface CursorPosition {
  /** 光标所在节点 ID */
  nodeId: string;
  /** 节点内字符偏移（可选，用于 LoroText 精确定位） */
  offset?: number;
}

export interface SelectionRange {
  anchor: CursorPosition;
  focus: CursorPosition;
}

export interface AwarenessState {
  user: UserInfo;
  /** 当前光标位置 */
  cursor?: CursorPosition;
  /** 当前选区 */
  selection?: SelectionRange;
  /** 最后更新时间（Unix ms） */
  updatedAt: number;
}

/** 状态变化回调，接收所有在线用户的最新状态 */
export type AwarenessChangeCallback = (
  states: ReadonlyMap<string, AwarenessState>,
) => void;

// ============================================================
// 内部状态
// ============================================================

let localUserId: string | null = null;
let localState: AwarenessState | null = null;

/** 远端用户状态 Map（userId → state） */
const remoteStates = new Map<string, AwarenessState>();

/** 变化订阅回调集合 */
const changeCallbacks = new Set<AwarenessChangeCallback>();

// ============================================================
// 内部辅助
// ============================================================

function getAllStates(): Map<string, AwarenessState> {
  const all = new Map<string, AwarenessState>(remoteStates);
  if (localUserId && localState) {
    all.set(localUserId, localState);
  }
  return all;
}

function notifyChange(): void {
  const allStates = getAllStates();
  for (const cb of changeCallbacks) cb(allStates);
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 初始化本地用户信息（必须在 setLocalState 之前调用）。
 */
export function setLocalUser(user: UserInfo): void {
  localUserId = user.id;
  if (localState) {
    localState = { ...localState, user, updatedAt: Date.now() };
  } else {
    localState = { user, updatedAt: Date.now() };
  }
  notifyChange();
}

/**
 * 更新本地光标/选区状态。
 * @throws 若未先调用 setLocalUser()
 */
export function setLocalState(
  patch: Partial<Pick<AwarenessState, 'cursor' | 'selection'>>,
): void {
  if (!localState) {
    throw new Error('[awareness] 请先调用 setLocalUser() 初始化用户信息');
  }
  localState = { ...localState, ...patch, updatedAt: Date.now() };
  notifyChange();
}

/**
 * 获取本地当前状态。
 */
export function getLocalState(): AwarenessState | null {
  return localState;
}

/**
 * 应用远端用户的 awareness 状态（由网络传输层调用）。
 */
export function applyRemoteState(userId: string, state: AwarenessState): void {
  remoteStates.set(userId, state);
  notifyChange();
}

/**
 * 移除远端用户状态（用户离线时调用）。
 */
export function removeRemoteState(userId: string): void {
  remoteStates.delete(userId);
  notifyChange();
}

/**
 * 获取所有在线用户的状态（含本地用户）。
 */
export function getStates(): ReadonlyMap<string, AwarenessState> {
  return getAllStates();
}

/**
 * 订阅 awareness 状态变化。
 * @returns 取消订阅函数
 */
export function onRemoteStateChange(
  callback: AwarenessChangeCallback,
): () => void {
  changeCallbacks.add(callback);
  return () => changeCallbacks.delete(callback);
}

/**
 * 序列化本地状态为 JSON 字符串（用于网络传输）。
 * 返回 null 若本地用户未初始化。
 */
export function serializeLocalState(): string | null {
  if (!localUserId || !localState) return null;
  return JSON.stringify({ userId: localUserId, state: localState });
}

/**
 * 反序列化并应用远端传来的状态（网络接收端调用）。
 */
export function deserializeAndApplyState(payload: string): void {
  const parsed = JSON.parse(payload) as unknown;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof obj.userId !== 'string' ||
    typeof obj.state !== 'object' || obj.state === null
  ) {
    console.warn('[awareness] deserializeAndApplyState: 无效 payload，已忽略');
    return;
  }
  const { userId, state } = obj as { userId: string; state: AwarenessState };
  applyRemoteState(userId, state);
}

/**
 * 重置所有状态（切换工作区时由 initLoroDoc 自动调用，也可用于测试）。
 */
export function resetAwareness(): void {
  localUserId = null;
  localState = null;
  remoteStates.clear();
  changeCallbacks.clear();
}
