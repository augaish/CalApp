import SwiftUI
import WidgetKit

#if canImport(ActivityKit)

  /// Calgym's rest countdown on the lock screen. The time comes first and
  /// large — it is what someone between sets glances down for — with what
  /// comes next underneath. The system counts the time down on its own, so
  /// it stays right with the app asleep.
  ///
  /// Replaces expo-live-activity's generic layout (copied over it on install
  /// by scripts/patch-live-activity.js); the data it reads is unchanged.
  struct LiveActivityView: View {
    let contentState: LiveActivityAttributes.ContentState
    let attributes: LiveActivityAttributes

    private var tint: Color { attributes.progressViewTint.map { Color(hex: $0) } ?? Color.purple }
    private var timeColor: Color { attributes.titleColor.map { Color(hex: $0) } ?? Color.white }
    private var subtitleColor: Color { attributes.subtitleColor.map { Color(hex: $0) } ?? Color.white.opacity(0.8) }

    var body: some View {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Image(systemName: "timer")
              .font(.system(size: 15, weight: .semibold))
            Text(contentState.title)
              .font(.system(size: 15, weight: .semibold))
          }
          .foregroundStyle(tint)

          if let end = contentState.timerEndDateInMilliseconds {
            Text(timerInterval: Date.toTimerInterval(miliseconds: end), countsDown: true)
              .font(.system(size: 54, weight: .bold, design: .rounded))
              .monospacedDigit()
              .foregroundStyle(timeColor)
              .lineLimit(1)
              .minimumScaleFactor(0.6)
          }

          if let subtitle = contentState.subtitle {
            Text(subtitle)
              .font(.system(size: 15, weight: .medium))
              .foregroundStyle(subtitleColor)
              .lineLimit(2)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 16)
    }
  }

#endif
