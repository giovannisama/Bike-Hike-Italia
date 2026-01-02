declare module "react-native-calendars" {
  export const Calendar: any;
  export const LocaleConfig: any;
  export interface DateData {
    dateString: string;
    day: number;
    month: number;
    year: number;
    timestamp: number;
  }

  export interface Theme {
    [key: string]: any;
    "stylesheet.calendar.main"?: any;
  }
}
