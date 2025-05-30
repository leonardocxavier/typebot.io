import type {
  BlockWithCreatableItems,
  DraggableItem,
} from "@/features/graph/providers/GraphDndProvider";
import { createId } from "@paralleldrive/cuid2";
import { blockHasItems, itemHasPaths } from "@typebot.io/blocks-core/helpers";
import type {
  Item,
  ItemIndices,
} from "@typebot.io/blocks-core/schemas/items/schema";
import type { BlockWithItems } from "@typebot.io/blocks-core/schemas/schema";
import type { CardsItem } from "@typebot.io/blocks-inputs/cards/schema";
import type { ButtonItem } from "@typebot.io/blocks-inputs/choice/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { PictureChoiceItem } from "@typebot.io/blocks-inputs/pictureChoice/schema";
import type { ConditionItem } from "@typebot.io/blocks-logic/condition/schema";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";
import { byId } from "@typebot.io/lib/utils";
import { type Draft, produce } from "immer";
import type { SetTypebot } from "../TypebotProvider";
import { deleteConnectedEdgesDraft } from "./edges";

type NewItem = Pick<DraggableItem, "outgoingEdgeId"> & Partial<DraggableItem>;

export type ItemsActions = {
  createItem: (item: NewItem, indices: ItemIndices) => string | undefined;
  duplicateItem: (indices: ItemIndices) => void;
  updateItem: (
    indices: ItemIndices,
    updates: Partial<Omit<Item, "id">>,
  ) => void;
  detachItemFromBlock: (indices: ItemIndices) => void;
  deleteItem: (indices: ItemIndices) => void;
  deleteItemPath: (indices: ItemIndices & { pathIndex: number }) => void;
};

const createItem = (
  block: Draft<BlockWithCreatableItems>,
  item: NewItem,
  itemIndex: number,
): Item => {
  switch (block.type) {
    case LogicBlockType.CONDITION: {
      const baseItem = item as ConditionItem;
      const newItem = {
        ...baseItem,
        id: "id" in item && item.id ? item.id : createId(),
        content: baseItem.content,
      };
      block.items.splice(itemIndex, 0, newItem);
      return newItem;
    }
    case InputBlockType.CHOICE: {
      const baseItem = item as ButtonItem;
      const newItem = {
        ...baseItem,
        id: "id" in item && item.id ? item.id : createId(),
        content: baseItem.content,
      };
      block.items.splice(itemIndex, 0, newItem);
      return newItem;
    }
    case InputBlockType.PICTURE_CHOICE: {
      const baseItem = item as PictureChoiceItem;
      const newItem = {
        ...baseItem,
        id: "id" in baseItem && item.id ? item.id : createId(),
      };
      block.items.splice(itemIndex, 0, newItem);
      return newItem;
    }
    case InputBlockType.CARDS: {
      const baseItem = item as CardsItem;
      const existingItem =
        block.items?.[itemIndex - 1] ?? block.items?.[itemIndex];
      const newItem = {
        ...baseItem,
        id: "id" in baseItem && item.id ? item.id : createId(),
        imageUrl:
          baseItem.imageUrl ??
          (existingItem?.imageUrl === null ? null : undefined),
        title:
          baseItem.title ?? (existingItem?.title === null ? null : undefined),
        description:
          baseItem.description ??
          (existingItem?.description === null ? null : undefined),
        paths: (baseItem.paths ?? existingItem?.paths ?? [{}]).map((path) => ({
          ...path,
          id: createId(),
        })),
      };
      block.items.splice(itemIndex, 0, newItem);
      return newItem;
    }
  }
};

const duplicateItem = (
  block: Draft<BlockWithCreatableItems>,
  itemIndex: number,
): Item => {
  const item = block.items[itemIndex];
  switch (block.type) {
    case LogicBlockType.CONDITION: {
      const baseItem = item as ConditionItem;
      const newItem = {
        ...baseItem,
        id: createId(),
        content: baseItem.content,
      };
      block.items.splice(itemIndex + 1, 0, newItem);
      return newItem;
    }
    case InputBlockType.CHOICE: {
      const baseItem = item as ButtonItem;
      const newItem = {
        ...baseItem,
        id: createId(),
        content: baseItem.content,
      };
      block.items.splice(itemIndex + 1, 0, newItem);
      return newItem;
    }
    case InputBlockType.PICTURE_CHOICE: {
      const baseItem = item as PictureChoiceItem;
      const newItem = {
        ...baseItem,
        id: createId(),
      };
      block.items.splice(itemIndex + 1, 0, newItem);
      return newItem;
    }
    case InputBlockType.CARDS: {
      const baseItem = item as CardsItem;
      const newItem = {
        ...baseItem,
        paths: baseItem.paths?.map((path) => ({
          ...path,
          id: createId(),
        })),
      };
      block.items.splice(itemIndex + 1, 0, newItem);
      return newItem;
    }
  }
};

const itemsAction = (setTypebot: SetTypebot): ItemsActions => ({
  createItem: (
    item: NewItem,
    { groupIndex, blockIndex, itemIndex }: ItemIndices,
  ) => {
    let newItemId: string | undefined;
    setTypebot((typebot) =>
      produce(typebot, (typebot) => {
        const block = typebot.groups[groupIndex].blocks[
          blockIndex
        ] as BlockWithCreatableItems;

        const newItem = createItem(block, item, itemIndex);

        if (!newItem) return;

        if (item.outgoingEdgeId) {
          const edgeIndex = typebot.edges.findIndex(byId(item.outgoingEdgeId));
          edgeIndex !== -1
            ? (typebot.edges[edgeIndex].from = {
                blockId: block.id,
                itemId: newItem.id,
              })
            : (newItem.outgoingEdgeId = undefined);
        }

        newItemId = newItem.id;
      }),
    );

    return newItemId;
  },
  duplicateItem: ({ groupIndex, blockIndex, itemIndex }: ItemIndices) =>
    setTypebot((typebot) =>
      produce(typebot, (typebot) => {
        const block = typebot.groups[groupIndex].blocks[
          blockIndex
        ] as BlockWithCreatableItems;
        duplicateItem(block, itemIndex);
      }),
    ),
  updateItem: (
    { groupIndex, blockIndex, itemIndex }: ItemIndices,
    updates: Partial<Omit<Item, "id">>,
  ) =>
    setTypebot((typebot) =>
      produce(typebot, (typebot) => {
        const block = typebot.groups[groupIndex].blocks[blockIndex];
        if (!blockHasItems(block)) return;
        (typebot.groups[groupIndex].blocks[blockIndex] as BlockWithItems).items[
          itemIndex
        ] = {
          ...block.items[itemIndex],
          ...updates,
        } as Item;
      }),
    ),
  detachItemFromBlock: ({ groupIndex, blockIndex, itemIndex }: ItemIndices) =>
    setTypebot((typebot) =>
      produce(typebot, (typebot) => {
        const block = typebot.groups[groupIndex].blocks[
          blockIndex
        ] as BlockWithItems;
        block.items.splice(itemIndex, 1);
      }),
    ),
  deleteItem: ({ groupIndex, blockIndex, itemIndex }: ItemIndices) =>
    setTypebot((typebot) =>
      produce(typebot, (typebot) => {
        const block = typebot.groups[groupIndex].blocks[
          blockIndex
        ] as BlockWithItems;
        if (block.items.length === 1) return;
        const removingItem = block.items[itemIndex];
        block.items.splice(itemIndex, 1);
        deleteConnectedEdgesDraft(typebot, removingItem.id);
      }),
    ),
  deleteItemPath: ({
    groupIndex,
    blockIndex,
    itemIndex,
    pathIndex,
  }: ItemIndices & { pathIndex: number }) =>
    setTypebot((typebot) =>
      produce(typebot, (typebot) => {
        const block = typebot.groups[groupIndex].blocks[blockIndex];
        if (!blockHasItems(block)) return;
        const item = (
          typebot.groups[groupIndex].blocks[blockIndex] as BlockWithItems
        ).items[itemIndex];
        if (!itemHasPaths(item)) return;
        const pathId = item.paths?.[pathIndex]?.id;
        deleteConnectedEdgesDraft(typebot, pathId);
        item.paths.splice(pathIndex, 1);
      }),
    ),
});

const duplicateItemDraft = (blockId: string) => (item: Item) => ({
  ...item,
  id: createId(),
  blockId,
  outgoingEdgeId: undefined,
});

export { itemsAction, duplicateItemDraft };
