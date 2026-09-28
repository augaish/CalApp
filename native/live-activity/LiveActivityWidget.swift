import ActivityKit
import SwiftUI
import WidgetKit

// Must match the app module's copy field for field: the app encodes this
// state and the widget decodes it. Unchanged from expo-live-activity 0.4.2.
struct LiveActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var subtitle: String?
    var timerEndDateInMilliseconds: Double?
    var progress: Double?
    var imageName: String?
    var dynamicIslandImageName: String?
  }

  var name: String
  var backgroundColor: String?
  var titleColor: String?
  var subtitleColor: String?
  var progressViewTint: String?
  var progressViewLabelColor: String?
  var deepLinkUrl: String?
  var timerType: DynamicIslandTimerType?
  var padding: Int?
  var paddingDetails: PaddingDetails?
  var imagePosition: String?
  var imageWidth: Int?
  var imageHeight: Int?
  var imageWidthPercent: Double?
  var imageHeightPercent: Double?
  var imageAlign: String?
  var contentFit: String?

  enum DynamicIslandTimerType: String, Codable {
    case circular
    case digital
  }

  struct PaddingDetails: Codable, Hashable {
    var top: Int?
    var bottom: Int?
    var left: Int?
    var right: Int?
    var vertical: Int?
    var horizontal: Int?
  }
}

/// Calgym's rest countdown in the Dynamic Island: a timer glyph on the left
/// and the time on the right when compact; the time large, with what comes
/// next, when expanded. Replaces the library's layout (see LiveActivityView).
struct LiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { context in
      LiveActivityView(contentState: context.state, attributes: context.attributes)
        .activityBackgroundTint(context.attributes.backgroundColor.map { Color(hex: $0) })
        .activitySystemActionForegroundColor(Color.white)
        .applyWidgetURL(from: context.attributes.deepLinkUrl)
    } dynamicIsland: { context in
      let tint = context.attributes.progressViewTint.map { Color(hex: $0) } ?? Color.purple
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image(systemName: "timer")
            Text(context.state.title)
          }
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(tint)
          .padding(.leading, 6)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let end = context.state.timerEndDateInMilliseconds {
            Text(timerInterval: Date.toTimerInterval(miliseconds: end), countsDown: true)
              .font(.system(size: 34, weight: .bold, design: .rounded))
              .monospacedDigit()
              .foregroundStyle(Color.white)
              .multilineTextAlignment(.trailing)
              .frame(maxWidth: 120, alignment: .trailing)
              .padding(.trailing, 6)
              .applyWidgetURL(from: context.attributes.deepLinkUrl)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          if let subtitle = context.state.subtitle {
            Text(subtitle)
              .font(.system(size: 15, weight: .medium))
              .foregroundStyle(Color.white.opacity(0.8))
              .lineLimit(1)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 6)
              .applyWidgetURL(from: context.attributes.deepLinkUrl)
          }
        }
      } compactLeading: {
        Image(systemName: "timer")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(tint)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
      } compactTrailing: {
        if let end = context.state.timerEndDateInMilliseconds {
          Text(timerInterval: Date.toTimerInterval(miliseconds: end), countsDown: true)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(tint)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 46)
            .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
      } minimal: {
        Image(systemName: "timer")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(tint)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
      }
    }
  }
}
