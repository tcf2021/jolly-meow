import { Random } from "meteor/random";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons/faChevronRight";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  checkboxesFeature,
  expandAllFeature,
  type ItemInstance,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import React, {
  type ComponentPropsWithRef,
  type FC,
  Suspense,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import FormCheck from "react-bootstrap/FormCheck";
import Modal from "react-bootstrap/Modal";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import buildDingwordTree from "../../lib/buildDingwordTree";
import type {
  DingwordFilteredType,
  DingwordType,
} from "../../lib/models/Dingwords";
import Loading from "./Loading";

const DingwordTree = styled.div`
  width: 100%;
`;
const DingwordTreeNode = styled.div`
  display: grid;
  grid-template-columns: auto 20px 20px;
  align-items: center;

  &:hover {
    background: ${({ theme }) => theme.colors.dingwordTreeHoverBackground};
  }
`;
const TreeNodeIcon = styled.div`
  width: 20px;
  color: #bbb;
`;

const StyledButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  /* Precedence boost needed to override bootstrap default button padding */
  && {
    /* Resize button to fit in one line-height */
    display: block;
    height: 20px;
    width: 20px;
    padding: 0;
  }
`;

type DingwordNode = DingwordFilteredType & {
  editing: boolean;
};

export type EditOwnDingwordsModalHandle = {
  show: () => void;
};

function makeDingwordTree(dingwords: Map<string, DingwordType>): {
  nodes: Map<string, DingwordNode>;
  rootNodeId: string;
} {
  const normalized = buildDingwordTree(dingwords.values());
  const nodes = new Map(
    Array.from(normalized.nodes, ([key, value]) => [
      key,
      {
        _id: value._id,
        name: value.name,
        children: value.children ?? [],
        selectable: value.selectable ?? true,
        editing: false,
      },
    ]),
  );
  return { nodes: nodes, rootNodeId: normalized.rootNodeId };
}

const EditOwnDingwordsModal = React.forwardRef(
  (
    {
      dingwords,
      initialDingwords,
      updateDingwords,
      recordAddedDingword,
    }: {
      dingwords: Map<string, DingwordType>;
      initialDingwords: string[];
      updateDingwords: (dingwords: string[]) => void;
      recordAddedDingword: (
        newDingword: string,
        parentId: string,
        clientId: string,
      ) => void;
    },
    forwardedRef: React.Ref<EditOwnDingwordsModalHandle>,
  ) => {
    const [visible, setVisible] = useState(true);

    const dingwordTree = makeDingwordTree(dingwords);
    const nodesRef = useRef(dingwordTree.nodes);
    const sourceRef = useRef(dingwords);
    const rootNodeId = dingwordTree.rootNodeId;

    const tree = useTree<DingwordNode>({
      initialState: {
        checkedItems: initialDingwords.filter((dw) => dingwords.has(dw)),
        expandedItems: Array.from(dingwordTree.nodes.keys()),
      },
      rootItemId: rootNodeId,
      isItemFolder: (_) => true,
      getItemName: (item) => item.getItemData().name,
      dataLoader: {
        getChildren: (itemId) => nodesRef.current.get(itemId)?.children ?? [],
        getItem: (itemId) => nodesRef.current.get(itemId)!,
      },
      indent: 20,
      canCheckFolders: true,
      propagateCheckedState: false,
      features: [
        syncDataLoaderFeature,
        checkboxesFeature,
        selectionFeature,
        expandAllFeature,
      ],
    });

    const [editing, setEditing] = useState<boolean>(false);
    const [alert, setAlert] = useState<string>("");
    const [newDingword, setNewDingword] = useState<string>();
    const [newDingwordId, setNewDingwordId] = useState<string>();
    const inputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus(); // safe, DOM exists
      }
    }, [editing]);

    const addDingword = (id: string) => {
      const newItem: DingwordNode = {
        _id: Random.id(),
        name: "",
        children: [],
        selectable: true,
        editing: true,
      };
      nodesRef.current.set(newItem._id, newItem);
      nodesRef.current.get(id)?.children.push(newItem._id);
      setEditing(true);
      setNewDingwordId(newItem._id);
      setAlert("");
      setNewDingword("");
      tree.rebuildTree();
      tree.getItemInstance(id).expand();
    };

    const onNewDingwordKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      item: ItemInstance<DingwordNode>,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitNewDingword(item);
      }
    };

    const deleteNewDingword = useCallback(
      (item: ItemInstance<DingwordNode>) => {
        // delete this node
        nodesRef.current.delete(item.getId());
        const parentId = item.getParent()!.getId();
        const parentNode = nodesRef.current.get(parentId)!;
        parentNode.children = parentNode.children?.filter(
          (id) => id !== item.getId(),
        );
        setEditing(false);
        setNewDingword("");
        setNewDingwordId("");
        tree.rebuildTree();
      },
      [tree],
    );

    const submitNewDingword = (item: ItemInstance<DingwordNode>) => {
      if (newDingword?.trim()) {
        // check duplicate
        if (
          tree
            .getItems()
            .some(
              (w) =>
                w.getId() !== item.getId() &&
                w.getItemName().toLowerCase() ===
                  newDingword.trim().toLowerCase(),
            )
        ) {
          setAlert(
            t(
              "dingwords.manager.renameDuplicate",
              "Duplicate names of dingwords are not allowed.",
            ),
          );
          deleteNewDingword(item);
        } else {
          // okay to add
          recordAddedDingword(
            newDingword.trim(),
            item.getParent()!.getId(),
            item.getId(),
          );
          item.getItemData().editing = false;
          item.getItemData().name = newDingword.trim();
          tree.setCheckedItems([...tree.getState().checkedItems, item.getId()]);
          tree.rebuildTree();
          setAlert("");
          setEditing(false);
          setNewDingword("");
          setNewDingwordId("");
        }
      } else {
        deleteNewDingword(item);
      }
    };

    const show = useCallback(() => {
      if (sourceRef.current !== dingwords) {
        sourceRef.current = dingwords;
        nodesRef.current = makeDingwordTree(dingwords).nodes;
        tree.setCheckedItems(
          initialDingwords.filter((id) => dingwords.has(id)),
        );
        tree.rebuildTree();
        void tree.expandAll();
      }
      setVisible(true);
    }, [dingwords, initialDingwords, tree]);
    const hide = useCallback(() => {
      if (newDingwordId) {
        const item = tree.getItemInstance(newDingwordId);
        deleteNewDingword(item);
      }
      updateDingwords(
        tree
          .getState()
          .checkedItems.map((i) => {
            const dw = tree.getItemInstance(i).getItemData();
            // filter out deleted and unselectable dingwords
            if (!dw || !dw.selectable) return null;
            return dw.name;
          })
          .filter((v) => v !== null),
      );
      setVisible(false);
    }, [newDingwordId, updateDingwords, deleteNewDingword, tree]);
    useImperativeHandle(forwardedRef, () => ({ show }), [show]);

    const { t } = useTranslation();
    const theme = useTheme();

    const modal = (
      <Modal show={visible} onHide={hide}>
        <Modal.Header closeButton>
          <Modal.Title>{t("dingwords.edit", "Edit Dingwords")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted">
            {t(
              "dingwords.selectionHelp",
              "Select the keywords you want notifications for. Save your profile after closing this dialog.",
            )}
          </p>
          <Button
            size="sm"
            className="mb-3"
            disabled={editing}
            onClick={() => addDingword(rootNodeId)}
          >
            <FontAwesomeIcon icon={faPlus} />{" "}
            {t("dingwords.add", "Add keyword")}
          </Button>
          <Suspense
            fallback={
              <div>
                <Loading inline />
              </div>
            }
          >
            {alert && <Alert variant="danger">{alert}</Alert>}
            <DingwordTree {...tree.getContainerProps()}>
              <AssistiveTreeDescription tree={tree} />
              {tree.getItems().map((item) => {
                return (
                  <DingwordTreeNode
                    key={item.getId()}
                    style={{
                      paddingLeft: `${item.getItemMeta().level * 20}px`,
                    }}
                  >
                    <span {...item.getProps()} style={{ display: "flex" }}>
                      <TreeNodeIcon>
                        {item.getItemData().children &&
                          item.getItemData().children.length > 0 && (
                            <FontAwesomeIcon
                              icon={
                                item.isExpanded()
                                  ? faChevronDown
                                  : faChevronRight
                              }
                              size="xs"
                            />
                          )}
                      </TreeNodeIcon>
                      {item.getItemData().editing ? (
                        <input
                          ref={inputRef}
                          onBlur={() => submitNewDingword(item)}
                          onChange={(e) => {
                            setNewDingword(e.currentTarget.value);
                          }}
                          onKeyDown={(e) => onNewDingwordKeyDown(e, item)}
                          type="text"
                          placeholder={t("dingwords.newName", "Keyword name")}
                        />
                      ) : (
                        <span>{item.getItemName()}</span>
                      )}
                    </span>
                    <div>
                      {item.getItemData().selectable && (
                        <FormCheck
                          type="checkbox"
                          {...item.getCheckboxProps()}
                        />
                      )}
                    </div>
                    <StyledButton
                      disabled={editing}
                      title={t(
                        "dingwords.addDingwordUnder",
                        `Add new dingword under {{parent}}`,
                        { parent: item.getItemName() },
                      )}
                      size="sm"
                      variant={theme.basicMode}
                      onClick={() => addDingword(item.getId())}
                    >
                      <FontAwesomeIcon icon={faPlus} size="sm" />
                    </StyledButton>
                  </DingwordTreeNode>
                );
              })}
            </DingwordTree>
          </Suspense>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={hide}>
            {t("common.close", "close")}
          </Button>
        </Modal.Footer>
      </Modal>
    );

    return createPortal(modal, document.body);
  },
);

export default EditOwnDingwordsModal;
