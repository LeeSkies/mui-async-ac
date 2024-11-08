import { Autocomplete, TextField, AutocompleteProps, CircularProgress, TextFieldProps, AutocompleteChangeReason, AutocompleteChangeDetails, AutocompleteValue } from '@mui/material';
import { 
  useQuery, 
  useInfiniteQuery, 
  UseQueryOptions,
  UseInfiniteQueryOptions, 
  GetNextPageParamFunction,
  useQueryClient,
  UseInfiniteQueryResult,
  QueryCache,
  InfiniteData
} from '@tanstack/react-query';
import { get } from 'lodash';
import React from 'react';

// Improved type for getting nested object paths
type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? K | `${K}.${NestedKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

// Helper type for path or function with proper typing
type PathOrFunction<T, R> = NestedKeyOf<T> | ((item: T) => R);

// Helper to get value from path or function
const getValueFromPath = <T extends object, R>(item: T, pathOrFn: PathOrFunction<T, R>): R => {
  if (typeof pathOrFn === 'function') {
    return pathOrFn(item);
  }
  return get(item, pathOrFn) as R;
};

// Query parameters type
interface QueryParams {
  [key: string]: string | number;
};

type AsyncAutocompleteValue<T> = AutocompleteValue<T, boolean, false, false> | string | string[] | number | number[] | null | undefined;

interface PageParam extends QueryParams {}

// Props specific to our component
interface AsyncAutocompleteBaseProps<T extends object> {
  valueField: PathOrFunction<T, any>;
  labelField: PathOrFunction<T, string>;
  optionsPath?: PathOrFunction<any, T[]>;
  value?: AsyncAutocompleteValue<T>;
  onChange?: (
    value: ReturnType<typeof getValueFromPath<T, any>> | ReturnType<typeof getValueFromPath<T, any>>[],
    option: T | T[]
  ) => void;
  queryProps?: UseInfiniteQueryOptions<T> | UseQueryOptions<T>;
  textFieldProps?: Omit<TextFieldProps, 'label'>;
  label?: React.ReactNode;
  searchable?: boolean;
  queryParams?: QueryParams;
}

// Props for regular query
interface AsyncAutocompleteRegularProps<T extends object> extends AsyncAutocompleteBaseProps<T> {
  url: string;
  initialPageParam?: never;
  getNextPageParam?: never;
  infinite?: never;
}

// Props for infinite query
interface AsyncAutocompleteInfiniteProps<T extends object> extends AsyncAutocompleteBaseProps<T> {
  url: string | ((lastPage?: PageParam) => string);
  initialPageParam?: PageParam;
  getNextPageParam?: GetNextPageParamFunction<PageParam | undefined, T>;
  infinite?: boolean;
}

// Combined props type with MUI Autocomplete props
type AsyncAutocompleteProps<T extends object> = (
  | AsyncAutocompleteRegularProps<T>
  | AsyncAutocompleteInfiniteProps<T>
) & Omit<AutocompleteProps<T, boolean, false, false>, 'options' | 'renderInput' | 'onChange' | 'value'>;

// Helper function to build URL with query parameters
const buildUrl = (baseUrl: string, params: QueryParams = {}, searchTerm?: string, searchable?: boolean) => {
  const searchParams = new URLSearchParams();
  
  // Add search term if searchable is true
  if (searchable && searchTerm) {
    searchParams.append('search', searchTerm);
  }
  
  // Add additional query parameters
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, value.toString());
  });
  
  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryString}` : baseUrl;
};

export function AsyncAutocomplete<T extends object>({
  url,
  label,
  valueField,
  labelField,
  optionsPath,
  onChange,
  value,
  getNextPageParam,
  initialPageParam,
  queryProps,
  textFieldProps,
  searchable = false,
  queryParams = {},
  infinite = false,
  ListboxProps,
  onFocus,
  ...autocompleteProps
}: AsyncAutocompleteProps<T>) {
  const [inputValue, setInputValue] = React.useState('');
  const [focusedInput, setFocusedInput] = React.useState(false);
  
  const queryClient = useQueryClient()

  const baseQueryKey = ['async-autocomplete', url, queryParams, searchable];
  if (searchable) baseQueryKey.push(inputValue);
  
  // Regular query setup
  const regularQuery = useQuery<
      T[],
      Error,
      T[]
    >({
    queryKey: baseQueryKey,
    queryFn: async () => {
      const cachedData = queryClient.getQueryData(baseQueryKey)
      if (cachedData) return cachedData;
      if (typeof url === 'function') return null;
      const fullUrl = buildUrl(url, queryParams, inputValue, searchable);
      const response = await fetch(fullUrl);
      return response.json();
    },
    enabled: focusedInput && !infinite && typeof url === 'string',
  });

  const infiniteQueryKey = [...baseQueryKey, 'infinite']

  // Infinite query setup
  const infiniteQuery = useInfiniteQuery<
    T,
    Error,
    { pages: T[] },
    any[],
    PageParam | undefined
  >({
    queryKey: infiniteQueryKey,
    queryFn: async ({ pageParam }) => {
      const baseUrl = typeof url === "string" ? url : url(pageParam);
      const fullUrl = buildUrl(baseUrl, queryParams, inputValue, searchable);
      const response = await fetch(fullUrl);
      return response.json();
    },
    getNextPageParam: (...args) => {
      if (getNextPageParam) return getNextPageParam(...args);
    },
    enabled: focusedInput && infinite,
    initialPageParam: initialPageParam,
    refetchOnMount: false,
  });

  // Get options based on query type
  const options = React.useMemo(() => {
    if (infinite && infiniteQuery.data) {
      const allPages = infiniteQuery.data.pages.flatMap(page => 
        optionsPath ? getValueFromPath(page, optionsPath) : page
      );
      return allPages;
    }
    if (regularQuery.data) {
      return optionsPath ? getValueFromPath(regularQuery.data, optionsPath) : regularQuery.data;
    }
    return [];
  }, [regularQuery.data, infiniteQuery.data, optionsPath]);

  // Handle option selection
  const handleChange = (
    _event: React.SyntheticEvent,
    option: T | T[] | null,
    reason: AutocompleteChangeReason,
    details?: AutocompleteChangeDetails<T> | undefined
  ) => {
    if (option && onChange) {
      if (Array.isArray(option)) {
        const values = option.map(item => getValueFromPath(item, valueField));
        onChange(values, option);
      } else {
        const value = getValueFromPath(option, valueField);
        onChange(value, option);
      }
    }
  };

  const findOptionByValue = React.useCallback((val: AsyncAutocompleteValue<T>): T | T[] | null => {
    if (!val) return null;
    if (typeof val === 'string' || typeof val === 'number') {
      return options.find(option => String(getValueFromPath(option, valueField)) === val.toString()) ?? null;
    }
    if (Array.isArray(val)) {
      if (typeof val[0] === 'string') {
        return options.filter(option => 
          (val as string[]).includes(String(getValueFromPath(option, valueField)))
        );
      }
      if (typeof val[0] === 'number') {
        return options.filter(option => 
          (val as number[]).includes(getValueFromPath(option, valueField))
        );
      }
      return val as T[];
    }
    return val;
  }, [options, valueField]);

  // Handle infinite scroll
  const handleScroll = (event: React.UIEvent<HTMLUListElement>) => {
    const list = event.currentTarget;
    if (
      infinite &&
      list.scrollTop + list.clientHeight >= list.scrollHeight - 50 &&
      infiniteQuery.hasNextPage &&
      !infiniteQuery.isFetchingNextPage
    ) {
      infiniteQuery.fetchNextPage();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (onFocus) onFocus(e);
    setFocusedInput(true);
  };

  const isLoading = regularQuery.isLoading || infiniteQuery.isLoading

  return (
    <Autocomplete
      options={options}
      loading={isLoading}
      onInputChange={(_event, newValue) => setInputValue(newValue)}
      getOptionLabel={(option) => getValueFromPath(option, labelField)}
      getOptionKey={(option) => getValueFromPath(option, valueField)}
      onChange={handleChange}
      onFocus={handleFocus}
      value={findOptionByValue(value)}
      isOptionEqualToValue={option => {
        if (!value) return false
        if (typeof value === "number") value = value.toString();
        if (typeof value === "string") return String(getValueFromPath(option, valueField)) === value;
        if (!Array.isArray(value)) return getValueFromPath(option, valueField) === getValueFromPath(value, valueField);
        return value.some(v => {
          if (typeof v === "string" || typeof v === "number") return String(getValueFromPath(option, valueField)) === v.toString();
          return getValueFromPath(option, valueField) === getValueFromPath(v, valueField);
        })
      }}
      ListboxProps={{
        onScroll: handleScroll,
        ...ListboxProps
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label || "Search"}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {(regularQuery.isLoading || infiniteQuery.isLoading) ? (
                    <CircularProgress color="inherit" size={20} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }
          }}
          {...textFieldProps}
        />
      )}
      {...autocompleteProps}
    />
  );
}