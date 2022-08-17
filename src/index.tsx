import React, {
  forwardRef,
  RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  LayoutRectangle,
  Modal,
  NativeEventSubscription,
  PanResponder,
  Platform,
  StatusBar,
  View,
} from "react-native";
import { actionSheetEventManager } from "./eventmanager";
import { SheetManager } from "./sheetmanager";
import { styles } from "./styles";
import type { ActionSheetProps } from "./types";
import { getDeviceHeight, getElevation, SUPPORTED_ORIENTATIONS } from "./utils";
import useSheetManager from "./hooks/use-sheet-manager";
export type ActionSheetRef = {
  /**
   * Show the ActionSheet.
   */
  show: () => void;

  /**
   * Hide the ActionSheet.
   */
  hide: (data: any) => void;
  /**
   * @removed Use `show` or `hide` functions or SheetManager to open/close ActionSheet.
   */
  setModalVisible: (visible?: boolean) => void;

  /**
   * Provide a value between 0 to 100 for the action sheet to snap to.
   */
  snapToOffset: (offset: number) => void;
  /**
   * @removed Use `useScrollHandlers` hook to enable scrolling in ActionSheet.
   */
  /**
   * When multiple snap points aret on the action sheet, use this to snap it to different
   * position.
   */
  snapToIndex: (index: number) => void;
  /**
   * @removed Use `useScrollHandlers` hook to enable scrolling in ActionSheet.
   */
  handleChildScrollEnd: () => void;

  /**
   * Used internally for scrollable views.
   */
  modifyGesturesForLayout: (
    id: string,
    layout: LayoutRectangle | undefined,
    scrollOffset: number
  ) => void;
};

const CALCULATED_DEVICE_HEIGHT = 0;

export default forwardRef<ActionSheetRef, ActionSheetProps>(
  function ActionSheet(
    {
      animated = true,
      closeOnPressBack = true,
      springOffset = 50,
      elevation = 5,
      defaultOverlayOpacity = 0.3,
      overlayColor = "black",
      closable = true,
      closeOnTouchBackdrop = true,
      drawUnderStatusBar = false,
      statusBarTranslucent = true,
      gestureEnabled = false,
      isModal = true,
      snapPoints = [100],
      initialSnapIndex = 0,
      overdrawEnabled = true,
      overdrawFactor = 15,
      overdrawSize = 100,
      ...props
    },
    ref
  ) {
    snapPoints =
      snapPoints[snapPoints.length - 1] !== 100
        ? [...snapPoints, 100]
        : snapPoints;
    const initialValue = useRef(0);
    const actionSheetHeight = useRef(0);
    const currentSnapIndex = useRef(initialSnapIndex);
    const gestureBoundaries = useRef<{
      [name: string]: LayoutRectangle & {
        scrollOffset?: number;
      };
    }>({});
    const [dimensions, setDimensions] = useState({
      width: Dimensions.get("window").width,
      height: CALCULATED_DEVICE_HEIGHT || getDeviceHeight(statusBarTranslucent),
      portrait: true,
    });
    const { visible, setVisible } = useSheetManager({
      id: props.id,
      onHide: (data) => {
        console.log(data);
        hideSheet(data);
      },
      onBeforeShow: props.onBeforeShow,
    });
    const [animations] = useState({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(0),
      underlayTranslateY: new Animated.Value(100),
    });

    const returnAnimation = (velocity?: number) => {
      if (!animated) {
        animations.translateY.setValue(initialValue.current);
        return;
      }
      const config = props.openAnimationConfig;
      Animated.spring(animations.translateY, {
        toValue: initialValue.current,
        useNativeDriver: true,
        ...config,
        velocity: velocity,
      }).start();
    };
    const hideAnimation = (
      callback?: ({ finished }: { finished: boolean }) => void
    ) => {
      if (!animated) {
        callback?.({ finished: true });
        return;
      }
      const config = props.closeAnimationConfig;
      Animated.timing(animations.translateY, {
        duration: 150,
        easing: Easing.in(Easing.ease),
        toValue: dimensions.height * 1.3,
        useNativeDriver: true,
        ...config,
      }).start(callback);
    };

    const getCurrentPosition = () => {
      //@ts-ignore
      return animations.translateY._value as number;
    };

    const getNextPosition = (snapIndex: number) => {
      return (
        actionSheetHeight.current -
        (actionSheetHeight.current * snapPoints[snapIndex]) / 100
      );
    };

    const opacityAnimation = (opacity: number) => {
      Animated.timing(animations.opacity, {
        duration: 150,
        easing: Easing.in(Easing.ease),
        toValue: opacity,
        useNativeDriver: true,
      }).start();
    };

    const hardwareBackPressEvent = useRef<NativeEventSubscription>();
    const Root: React.ElementType =
      isModal && !props?.backgroundInteractionEnabled ? Modal : Animated.View;

    useImperativeHandle(
      ref,
      () => ({
        show: () => {
          setVisible(true);
        },
        hide: (data: any) => {
          hideSheet(data);
        },
        setModalVisible: (visible?: boolean) => {
          if (visible) {
            setVisible(true);
          } else {
            hideSheet();
          }
        },
        snapToOffset: (offset: number) => {
          initialValue.current =
            actionSheetHeight.current -
            (actionSheetHeight.current * offset) / 100;
          Animated.spring(animations.translateY, {
            toValue: initialValue.current,
            useNativeDriver: true,
            ...props.openAnimationConfig,
          }).start();
        },
        snapToIndex: (index: number) => {
          if (index > snapPoints.length || index < 0) return;
          currentSnapIndex.current = index;
          initialValue.current = getNextPosition(index);
          Animated.spring(animations.translateY, {
            toValue: initialValue.current,
            useNativeDriver: true,
            ...props.openAnimationConfig,
          }).start();
        },
        handleChildScrollEnd: () => {
          console.warn(
            "handleChildScrollEnd has been removed. Please use `useScrollHandlers` hook to enable scrolling in ActionSheet"
          );
        },
        modifyGesturesForLayout: (id, layout, scrollOffset) => {
          //@ts-ignore
          gestureBoundaries.current[id] = {
            ...layout,
            scrollOffset: scrollOffset,
          };
        },
      }),
      []
    );

    useEffect(() => {
      if (props.id) {
        SheetManager.add(props.id);
        SheetManager.registerRef(props.id, ref as RefObject<ActionSheetRef>);
      }
      const listener = animations.translateY.addListener((value) => {
        props?.onChange?.(value.value);
        actionSheetEventManager.publish("onoffsetchange", value.value);
        if (drawUnderStatusBar) {
          if (actionSheetHeight.current === dimensions.height) {
            const offsetTop = value.value;
            if (offsetTop < 100) {
              animations.underlayTranslateY.setValue(offsetTop);
            }
          }
        }
      });
      return () => {
        listener && animations.translateY.removeListener(listener);
        props.id && SheetManager.remove(props.id);
        hardwareBackPressEvent.current?.remove();
      };
    }, [props?.id, dimensions.height]);

    const onHardwareBackPress = () => {
      if (visible && closable && closeOnPressBack) {
        hideSheet();
        return true;
      }
      return false;
    };

    const onRequestClose = () => {};

    const rootProps = isModal
      ? {
          visible: true,
          animationType: "none",
          testID: props.testID,
          supportedOrientations: SUPPORTED_ORIENTATIONS,
          onShow: props.onOpen,
          onRequestClose: onRequestClose,
          transparent: true,
          statusBarTranslucent: statusBarTranslucent,
        }
      : {
          testID: props.testID,
          onLayout: () => {
            hardwareBackPressEvent.current = BackHandler.addEventListener(
              "hardwareBackPress",
              onHardwareBackPress
            );
            props?.onOpen?.();
          },
          style: {
            position: "absolute",
            zIndex: 9999,
            width: "100%",
            height: "100%",
          },
          pointerEvents: props?.backgroundInteractionEnabled
            ? "box-none"
            : "auto",
        };

    const onDeviceLayout = React.useCallback((event: LayoutChangeEvent) => {
      const safeMarginFromTop = StatusBar.currentHeight || 0;
      let height = event.nativeEvent.layout.height - safeMarginFromTop;
      let width = Dimensions.get("window").width;
      if (
        height?.toFixed(0) === CALCULATED_DEVICE_HEIGHT?.toFixed(0) &&
        width?.toFixed(0) === dimensions.width.toFixed(0)
      )
        return;

      if (!initialValue.current) {
        animations.translateY.setValue(actionSheetHeight.current * 1.3);
      }

      initialValue.current =
        actionSheetHeight.current -
        (actionSheetHeight.current * snapPoints[currentSnapIndex.current]) /
          100;

      setDimensions({
        width,
        height,
        portrait: height > width,
      });
      opacityAnimation(1);
      returnAnimation();
    }, []);

    const hideSheet = (data?: any) => {
      hideAnimation(({ finished }) => {
        if (closable) opacityAnimation(0);
        if (finished) {
          if (closable) {
            setVisible(false);
            if (props.id) {
              actionSheetEventManager.publish(
                `onclose_${props.id}`,
                data || props.payload
              );
            }
          } else {
            returnAnimation();
          }
        }
      });
    };
    const handlers = React.useMemo(
      () =>
        !gestureEnabled
          ? { panHandlers: {} }
          : PanResponder.create({
              onMoveShouldSetPanResponderCapture: (event, gesture) => {
                let gestures = true;
                for (let id in gestureBoundaries.current) {
                  const gestureBoundary = gestureBoundaries.current[id];
                  if (getCurrentPosition() > 3 || !gestureBoundary)
                    gestures = true;

                  const scrollOffset = gestureBoundary?.scrollOffset || 0;

                  if (
                    event.nativeEvent.pageY > gestureBoundary?.y &&
                    gesture.vy > 0 &&
                    scrollOffset <= 0
                  ) {
                    gestures = true;
                  } else {
                    gestures = false;
                  }
                }
                return gestures;
              },
              onStartShouldSetPanResponder: () => true,
              onPanResponderMove: (_event, gesture) => {
                if (
                  getCurrentPosition() <= -overdrawSize / 2 &&
                  gesture.dy <= 0
                )
                  return;
                animations.translateY.setValue(
                  getCurrentPosition() < 0
                    ? overdrawEnabled
                      ? 0 + gesture.dy / overdrawFactor
                      : 0
                    : initialValue.current + gesture.dy
                );
              },
              onPanResponderEnd: (_event, gesture) => {
                const isMovingUp = getCurrentPosition() < initialValue.current;
                if (
                  (!isMovingUp &&
                    getCurrentPosition() <
                      initialValue.current + springOffset) ||
                  (isMovingUp &&
                    getCurrentPosition() > initialValue.current - springOffset)
                ) {
                  returnAnimation(gesture.vy);
                  return;
                }

                if (!isMovingUp) {
                  snapBackward(gesture.vy);
                } else {
                  snapForward(gesture.vy);
                }
              },
            }),
      [hideSheet, gestureEnabled, closable]
    );

    /**
     * Snap towards the top
     */
    const snapForward = (vy: number) => {
      if (currentSnapIndex.current === snapPoints.length - 1) {
        returnAnimation(vy);
        return;
      }
      let nextSnapPoint = 0;
      let nextSnapIndex = 0;
      for (let i = currentSnapIndex.current; i < snapPoints.length; i++) {
        if (getNextPosition(i) < getCurrentPosition()) {
          nextSnapPoint = snapPoints[(nextSnapIndex = i)];
          break;
        }
      }

      if (nextSnapPoint > 100) {
        console.warn("Snap points should range between 0 to 100.");
        returnAnimation(vy);
        return;
      }
      currentSnapIndex.current = nextSnapIndex;
      initialValue.current = getNextPosition(currentSnapIndex.current);
      returnAnimation(vy);
    };
    /**
     * Snap towards the bottom
     */
    const snapBackward = (vy: number) => {
      if (currentSnapIndex.current === 0) {
        if (closable) {
          initialValue.current = dimensions.height * 1.3;
          hideSheet();
        } else {
          returnAnimation(vy);
        }
        return;
      }

      let nextSnapPoint = 0;
      let nextSnapIndex = 0;
      for (let i = currentSnapIndex.current; i > -1; i--) {
        if (getNextPosition(i) > getCurrentPosition()) {
          nextSnapPoint = snapPoints[(nextSnapIndex = i)];
          break;
        }
      }

      if (nextSnapPoint < 0) {
        console.warn("Snap points should range between 0 to 100.");
        returnAnimation(vy);
        return;
      }
      currentSnapIndex.current = nextSnapIndex;
      initialValue.current = getNextPosition(currentSnapIndex.current);
      returnAnimation(vy);
    };

    const onTouch = () => {
      if (closeOnTouchBackdrop && closable) {
        hideSheet();
      }
    };

    const onSheetLayout = (event: LayoutChangeEvent) => {
      actionSheetHeight.current = event.nativeEvent.layout.height;
    };

    if (!visible) return null;
    return (
      <Root {...rootProps}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{
            height: "100%",
            width: "100%",
          }}
          {...props.keyboardAvoidingViewProps}
        >
          <Animated.View
            onLayout={onDeviceLayout}
            pointerEvents={
              props?.backgroundInteractionEnabled ? "box-none" : "auto"
            }
            style={[
              styles.parentContainer,
              {
                opacity: animations.opacity,
                width: "100%",
                justifyContent: "flex-end",
              },
            ]}
          >
            {!props?.backgroundInteractionEnabled ? (
              <View
                onTouchEnd={onTouch}
                onTouchMove={onTouch}
                onTouchStart={onTouch}
                testID={props.testIDs?.backdrop}
                style={{
                  height: "100%",
                  width: "100%",
                  position: "absolute",
                  zIndex: 1,
                  backgroundColor: overlayColor,
                  opacity: defaultOverlayOpacity,
                }}
              />
            ) : null}

            <Animated.View
              {...handlers.panHandlers}
              onLayout={onSheetLayout}
              style={[
                styles.container,
                {
                  borderTopRightRadius: 10,
                  borderTopLeftRadius: 10,
                  ...getElevation(
                    typeof elevation === "number" ? elevation : 5
                  ),
                },
                props.containerStyle,
                {
                  zIndex: 10,
                  maxHeight: dimensions.height,
                  transform: [
                    {
                      translateY: animations.translateY,
                    },
                  ],
                },
              ]}
            >
              {drawUnderStatusBar ? (
                <Animated.View
                  style={{
                    height: 100,
                    position: "absolute",
                    top: -50,
                    backgroundColor:
                      props.containerStyle?.backgroundColor || "white",
                    width: "100%",
                    borderRadius: props.containerStyle?.borderRadius || 10,
                    transform: [
                      {
                        translateY: animations.underlayTranslateY,
                      },
                    ],
                  }}
                />
              ) : null}
              {gestureEnabled || props.headerAlwaysVisible ? (
                props.CustomHeaderComponent ? (
                  props.CustomHeaderComponent
                ) : (
                  <Animated.View
                    style={[styles.indicator, props.indicatorStyle]}
                  />
                )
              ) : null}

              {props?.children}

              {overdrawEnabled ? (
                <Animated.View
                  style={{
                    height: overdrawSize,
                    position: "absolute",
                    bottom: -overdrawSize,
                    backgroundColor:
                      props.containerStyle?.backgroundColor || "white",
                    width: dimensions.width,
                  }}
                />
              ) : null}
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Root>
    );
  }
);
